// Shared server helpers for Gleam's Netlify functions.
// The Wix client secret lives ONLY in Netlify's environment variables (WIX_CLIENT_SECRET), never in the site code.

const fail = (status, code) => Object.assign(new Error(code), { status, code });

/* ---------- Requests and responses ---------- */

export const json = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// Wraps a function so any thrown { status, code } becomes a JSON error response.
export const handle = fn => async (req, ctx) => {
  try { return await fn(req, ctx); }
  catch (e) { return json(e.status || 500, { error: e.code || 'server_error' }); }
};

// Only accept calls made from Gleam's own pages.
export function sameOrigin(req) {
  const o = req.headers.get('origin');
  if (o && new URL(o).host !== new URL(req.url).host) throw fail(403, 'forbidden');
}

export const clip = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
export const LINK = /(https?:\/\/|www\.)/i;
export const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
export const isId = v => /^[A-Za-z0-9-]{8,64}$/.test(v);   // Wix item IDs

/* ---------- Who is calling (Supabase login) ---------- */

// Supabase handles Gleam logins. These two values are public (they're also in the pages).
export const SUPABASE_URL = 'https://huskusxmuyxiucufcmkv.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_rsLVPdoFlMhH4_k4khm4MA_YW25zBRS';

// Asks Supabase to confirm the person's own login token.
export async function memberFrom(req) {
  const raw = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!raw || raw.length > 4000) throw fail(401, 'login_required');
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + raw } });
  if (!r.ok) throw fail(401, 'login_required');
  const u = await r.json().catch(() => null);
  if (!u || !u.id) throw fail(401, 'login_required');
  return { id: u.id, email: String(u.email || '').toLowerCase() };
}

/* ---------- Calling Wix as the site owner ---------- */

const WIX = 'https://www.wixapis.com';
const CLIENT_ID = 'ea2ece4b-eb1c-48a5-aae5-b77fd4593c4b'; // public Wix client ID
const ITEMS = '/wix-data/v2/items';

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

// Only ever used after the caller has been checked.
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

// Item helpers for Wix's data lists ("collections").
const itemPath = (collection, id) => ITEMS + '/' + encodeURIComponent(id) + (collection ? '?dataCollectionId=' + collection : '');

/** Raw Wix items ({ id, data }) matching a Wix query object. */
export const queryItems = async (collection, query) =>
  (await wixAdmin(ITEMS + '/query', { dataCollectionId: collection, query })).dataItems || [];

/** One item's data. Throws { status: 404 } if it doesn't exist. */
export const getItem = async (collection, id) =>
  (await wixAdmin(itemPath(collection, id), undefined, 'GET')).dataItem.data;

export const insertItem = (collection, data) =>
  wixAdmin(ITEMS, { dataCollectionId: collection, dataItem: { data } });

/** Replaces an item's whole data. Wix sets its own created/updated dates, so those are left out. */
export const replaceItem = (collection, id, data) => {
  const d = { ...data };
  delete d._createdDate; delete d._updatedDate;
  return wixAdmin(itemPath('', id), { dataCollectionId: collection, dataItem: { id, data: d } }, 'PUT');
};

export const removeItem = (collection, id) => wixAdmin(itemPath(collection, id), undefined, 'DELETE');

/* ---------- Gleam's data ---------- */

// Filter matching things a member owns: by login ID, or by the email they logged in with or put on the item.
export function ownedBy(member) {
  const or = [{ memberId: member.id }];
  if (member.email) or.push({ memberEmail: member.email }, { email: member.email });
  return { $or: or };
}

/** How many items this member created in the last `ms` milliseconds (counts up to `limit`). Used to slow down floods. */
export async function recentCount(collection, memberId, ms, limit) {
  const since = new Date(Date.now() - ms).toISOString();
  return (await queryItems(collection, { filter: { memberId, _createdDate: { $gt: { $date: since } } }, paging: { limit } })).length;
}

// A detailer's private contact details live on their application, never on the public listing.
export async function detailerContact(listing) {
  if (!listing || !listing.applicationId) return {};
  try {
    const a = (await getItem('DetailerApplications', listing.applicationId)) || {};
    return { email: String(a.email || a.memberEmail || ''), phone: String(a.phone || '') };
  } catch (e) { return {}; }
}

// The public listings that belong to this logged-in member (through their applications).
export async function listingsForMember(member) {
  const ids = (await queryItems('DetailerApplications', { filter: ownedBy(member), paging: { limit: 50 } })).map(x => x.id);
  if (!ids.length) return [];
  return (await queryItems('Detailers', { filter: { applicationId: { $in: ids } }, paging: { limit: 50 } }))
    .map(x => ({ id: x.id, ...(x.data || {}) }));
}

// Gleam's own team (owner, co-owners), kept in the admin-only Wix list "TeamRoles".
export async function teamRole(member) {
  if (!member || !member.email) return null;
  const v = ((await queryItems('TeamRoles', { filter: { email: member.email }, paging: { limit: 1 } }))[0] || {}).data || {};
  const role = String(v.role || '').toLowerCase();
  return role === 'owner' || role === 'co-owner' ? { role, name: String(v.name || '') } : null;
}
