// Server-side login wall: these pages are only sent to someone with a valid Gleam member login.
// The browser keeps the member's Supabase login in a "gleam_at" cookie; Supabase confirms it before the page goes out.

// Public values, also in netlify/lib/wix.mjs. Edge functions are bundled separately, so they keep their own copy.
const SUPABASE_URL = 'https://huskusxmuyxiucufcmkv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rsLVPdoFlMhH4_k4khm4MA_YW25zBRS';

const RECHECK_MS = 5 * 60_000;  // re-confirm a token with Supabase at most every 5 minutes
const MAX_CACHED = 5000;
const OK = new Map();           // token -> time we last confirmed it (short cache so pages stay fast)

function tokenFrom(request) {
  const raw = (request.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith('gleam_at='));
  if (!raw) return '';
  try { return decodeURIComponent(raw.slice('gleam_at='.length)); } catch { return ''; }
}

async function confirmed(token) {
  const seen = OK.get(token);
  if (seen && Date.now() - seen <= RECHECK_MS) return true;
  let r = null;
  try { r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } }); } catch {}
  if (!r || !r.ok) { OK.delete(token); return false; }
  if (OK.size > MAX_CACHED) OK.clear();
  OK.set(token, Date.now());
  return true;
}

export default async (request, context) => {
  const url = new URL(request.url);
  const toLogin = () => Response.redirect(new URL('/login.html?returnTo=' + encodeURIComponent(url.pathname + url.search), url), 302);
  const token = tokenFrom(request);
  if (!token || token.length > 4000 || !(await confirmed(token))) return toLogin();
  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-store');
  return out;
};

export const config = { path: ['/account', '/account.html', '/admin', '/admin.html'] };
