// Gleam member login (Supabase Auth). Gleam's data (bookings, detailers, profiles) stays in Wix,
// reached only through Gleam's own /api/* server functions, which check this login.
// Used by login.html, account.html, admin.html, index.html and detailers.html. Readable source: no build step.

import { AuthClient } from '/js/vendor/supabase-auth.js';

// Public values (safe to show): the project address and its publishable key.
const SUPABASE_URL = 'https://huskusxmuyxiucufcmkv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rsLVPdoFlMhH4_k4khm4MA_YW25zBRS';
const STORAGE_KEY = 'sb-huskusxmuyxiucufcmkv-auth-token';   // pages check this key to tell if someone is logged in
// Things saved on this device for the logged-in person; wiped on logout.
const PERSONAL_KEYS = ['gleam-zip', 'gleam-address', 'gleam-pending-profile', 'wix-visitor-ea2ece4b-eb1c-48a5-aae5-b77fd4593c4b'];

const auth = new AuthClient({
  url: SUPABASE_URL + '/auth/v1',
  headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  storageKey: STORAGE_KEY,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  flowType: 'pkce',
});

// The login is mirrored into the "gleam_at" cookie so Netlify's login wall can check it before sending a page.
function syncLoginCookie(session) {
  try {
    if (session && session.access_token) {
      const maxAge = Math.max(0, Math.floor((session.expires_at || 0) - Date.now() / 1000));
      document.cookie = 'gleam_at=' + encodeURIComponent(session.access_token) + ';path=/;max-age=' + maxAge + ';secure;samesite=lax';
    } else {
      document.cookie = 'gleam_at=;path=/;max-age=0;secure;samesite=lax';
    }
  } catch {}
}

function toMember(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  const full = meta.first_name || meta.full_name || meta.name || '';
  return {
    id: user.id,
    loginEmail: user.email || '',
    firstName: String(full).trim().split(/\s+/)[0] || '',
    memberSince: user.created_at || null,
  };
}

let state = { loading: true, member: null };
const listeners = new Set();
const recoveryHandlers = [];
function setState(next) { state = next; listeners.forEach(fn => { try { fn(state); } catch {} }); }

auth.onAuthStateChange((event, session) => {
  syncLoginCookie(session);
  if (event === 'PASSWORD_RECOVERY') recoveryHandlers.forEach(fn => { try { fn(); } catch {} });
  setState({ loading: false, member: toMember(session && session.user) });
});

const ready = auth.getSession().then(({ data }) => {
  syncLoginCookie(data.session);
  setState({ loading: false, member: toMember(data.session && data.session.user) });
}).catch(() => setState({ loading: false, member: null }));

export function getMemberState() { return state; }
export function subscribeMember(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export function onPasswordRecovery(fn) { recoveryHandlers.push(fn); }

function friendly(error) {
  if (!error) return null;
  const code = error.code || '';
  if (error.status === 429 || /rate|too many/i.test(code + ' ' + error.message)) return 'tooMany';
  if (code === 'invalid_credentials') return 'invalidPassword';
  if (code === 'email_not_confirmed') return 'emailNotConfirmed';
  if (code === 'user_already_exists' || code === 'email_exists') return 'emailAlreadyExists';
  if (code === 'weak_password') return 'weakPassword';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'badEmail';
  return 'generic';
}

// What every login action returns: { ok: true } or { ok: false, errorCode } (see friendly()).
const result = error => error ? { ok: false, errorCode: friendly(error) } : { ok: true };
// Where Supabase sends people back to after a confirmation email or Google.
const backTo = returnTo => location.origin + '/login.html?returnTo=' + encodeURIComponent(returnTo);

export async function login(email, password) {
  await ready;
  const { error } = await auth.signInWithPassword({ email, password });
  return result(error);
}

// { ok:true } when logged in straight away, { ok:true, checkEmail:true } when Supabase sent a confirmation link.
export async function register(email, password, profile = {}, returnTo = '/') {
  await ready;
  const { data, error } = await auth.signUp({
    email, password,
    options: {
      emailRedirectTo: backTo(returnTo),
      data: { first_name: profile.firstName || '', last_name: profile.lastName || '' },
    },
  });
  if (error) return result(error);
  // Supabase hides whether an email is taken: a known address comes back with no identities.
  // Answer the same way either way, so the sign-up form can't be used to check who has an account.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { ok: true, checkEmail: true };
  return data.session ? { ok: true } : { ok: true, checkEmail: true };
}

export async function loginWithGoogle(returnTo = '/') {
  await ready;
  const { error } = await auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: backTo(returnTo) },
  });
  return result(error);
}

export async function sendPasswordReset(email) {
  await ready;
  const { error } = await auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/login.html?reset=1' });
  return result(error);
}

export async function updatePassword(password) {
  await ready;
  const { error } = await auth.updateUser({ password });
  return result(error);
}

export async function accessToken() {
  await ready;
  const { data } = await auth.getSession();
  return data.session ? data.session.access_token : null;
}

// Calls one of Gleam's own server functions with the member's login attached.
export async function api(path, { method = 'GET', body } = {}) {
  const token = await accessToken();
  const headers = { Authorization: 'Bearer ' + (token || '') };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(out.error || ('HTTP ' + r.status)); e.status = r.status; e.body = out; throw e; }
  return out;
}

export async function logout(returnTo = '/login.html') {
  try { await auth.signOut(); } catch {}
  try { localStorage.removeItem(STORAGE_KEY); PERSONAL_KEYS.forEach(k => localStorage.removeItem(k)); } catch {}
  syncLoginCookie(null);
  location.href = returnTo;
}
