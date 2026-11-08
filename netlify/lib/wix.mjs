// Shared server helpers for Gleam's Netlify functions.
// The Wix client secret lives ONLY in Netlify's environment variables (WIX_CLIENT_SECRET), never in the site code.
export const WIX = 'https://www.wixapis.com';
export const CLIENT_ID = 'ea2ece4b-eb1c-48a5-aae5-b77fd4593c4b';

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

// Who is calling? Asks Wix to confirm the member's own login token.
export async function memberFrom(req) {
  const token = req.headers.get('authorization') || '';
  if (!token || token.length > 4000) throw fail(401, 'login_required');
  const r = await fetch(WIX + '/members/v1/members/my', { headers: { Authorization: token } });
  if (!r.ok) throw fail(401, 'login_required');
  const d = await r.json().catch(() => null);
  const m = d && d.member;
  const id = m && (m.id || m._id);
  if (!id) throw fail(401, 'login_required');
  return { id, email: m.loginEmail || '' };
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
