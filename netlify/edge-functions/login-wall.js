// Server-side login wall: these pages are only sent to someone with a valid Gleam member login.
// The browser keeps the member's Supabase login in a "gleam_at" cookie; Supabase confirms it before the page goes out.
const SUPABASE_URL = 'https://huskusxmuyxiucufcmkv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rsLVPdoFlMhH4_k4khm4MA_YW25zBRS';
const OK = new Map(); // token -> time we last confirmed it (short cache so pages stay fast)

export default async (request, context) => {
  const url = new URL(request.url);
  const toLogin = () => Response.redirect(new URL('/login.html?returnTo=' + encodeURIComponent(url.pathname + url.search), url), 302);
  const raw = (request.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith('gleam_at='));
  if (!raw) return toLogin();
  let token = '';
  try { token = decodeURIComponent(raw.slice(9)); } catch { return toLogin(); }
  if (!token || token.length > 4000) return toLogin();
  const seen = OK.get(token);
  if (!seen || Date.now() - seen > 5 * 60_000) {
    let r = null;
    try { r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } }); } catch {}
    if (!r || !r.ok) { OK.delete(token); return toLogin(); }
    if (OK.size > 5000) OK.clear();
    OK.set(token, Date.now());
  }
  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-store');
  return out;
};

export const config = { path: ['/', '/index', '/index.html', '/detailers', '/detailers.html', '/account', '/account.html'] };
