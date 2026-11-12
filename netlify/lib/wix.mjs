// Shared server helpers for Gleam's Netlify functions.
// The Wix client secret lives ONLY in Netlify's environment variables (WIX_CLIENT_SECRET), never in the site code.
const WIX = 'https://www.wixapis.com';
const CLIENT_ID = 'ea2ece4b-eb1c-48a5-aae5-b77fd4593c4b'; // public Wix client ID

const fail = (status, code) => Object.assign(new Error(code), { status, code });

let admin = null;
async function adminToken() {
  if (admin && admin.exp > Date.now() + 60_000) return admin.token;
  const secret = process.env.WIX_CLIENT_SECRET;
  if (!secret) throw fail(503, 'not_configured');
  const r = await fetch(WIX + '/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: secret }),
  });
  if (!r.ok) throw fail(503, 'not_configured');
  const d = await r.json();
  admin = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return admin.token;
}

// Calls Wix as the site owner. Only ever used after the caller has been checked.
export async function wixAdmin(path, body, method = 'POST') {
  const r = await fetch(WIX + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: await adminToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw fail(r.status === 404 ? 404 : 502, 'wix_error');
  return d;
}

// Supabase handles Gleam logins. These two values are public (they're also in the pages).
export const SUPABASE_URL = 'https://huskusxmuyxiucufcmkv.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_rsLVPdoFlMhH4_k4khm4MA_YW25zBRS';

// Who is calling? Asks Supabase to confirm the person's own login token.
export async function memberFrom(req) {
  const raw = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!raw || raw.length > 4000) throw fail(401, 'login_required');
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + raw } });
  if (!r.ok) throw fail(401, 'login_required');
  const u = await r.json().catch(() => null);
  if (!u || !u.id) throw fail(401, 'login_required');
  return { id: u.id, email: String(u.email || '').toLowerCase() };
}

// Only accept calls made from Gleam's own pages.
export function sameOrigin(req) {
  const o = req.headers.get('origin');
  if (o && new URL(o).host !== new URL(req.url).host) throw fail(403, 'forbidden');
}

export const json = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const handle = fn => async (req, ctx) => {
  try { return await fn(req, ctx); }
  catch (e) { return json(e.status || 500, { error: e.code || 'server_error' }); }
};

export const clip = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
export const LINK = /(https?:\/\/|www\.)/i;

// A detailer's private contact details live on their application, never on the public listing.
export async function detailerContact(listing) {
  if (!listing || !listing.applicationId) return {};
  try {
    const a = (await wixAdmin('/wix-data/v2/items/' + encodeURIComponent(listing.applicationId) + '?dataCollectionId=DetailerApplications', undefined, 'GET')).dataItem.data || {};
    return { email: String(a.email || a.memberEmail || ''), phone: String(a.phone || '') };
  } catch (e) { return {}; }
}

// The public listings that belong to this logged-in member (through their applications).
export async function listingsForMember(member) {
  const or = [{ memberId: member.id }];
  if (member.email) or.push({ memberEmail: member.email }, { email: member.email });
  const apps = await wixAdmin('/wix-data/v2/items/query', { dataCollectionId: 'DetailerApplications', query: { filter: { $or: or }, paging: { limit: 50 } } });
  const ids = (apps.dataItems || []).map(x => x.id);
  if (!ids.length) return [];
  const l = await wixAdmin('/wix-data/v2/items/query', { dataCollectionId: 'Detailers', query: { filter: { applicationId: { $in: ids } }, paging: { limit: 50 } } });
  return (l.dataItems || []).map(x => ({ id: x.id, ...(x.data || {}) }));
}
