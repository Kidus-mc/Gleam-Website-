// Gleam member login (Wix Headless).
// Used by login.html and account.html:
//   import { subscribeMember, getMemberState, login, register, verifyEmail, logout, wixRequest, WIX_CLIENT_ID } from '/js/gleam-auth.js';
// Readable source: no build step. Edit this file directly.

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Gleam's public Wix client ID (safe to show; the secret lives only on Netlify).
export const WIX_CLIENT_ID = "ea2ece4b-eb1c-48a5-aae5-b77fd4593c4b";

const WIX_API_BASE = "https://www.wixapis.com";
const TOKEN_URL = `${WIX_API_BASE}/oauth2/token`;
const STORAGE_KEY = `wix-visitor-${WIX_CLIENT_ID}`;
// Things saved on this device for the logged-in person; wiped on logout.
const PERSONAL_KEYS = ["gleam-zip", "gleam-address", "gleam-pending-profile"];

// ---------------------------------------------------------------------------
// Login tokens: kept in localStorage, mirrored into the "gleam_at" cookie so
// Netlify's server-side login wall can check members before sending a page.
// ---------------------------------------------------------------------------

let memory = null;

function syncLoginCookie(tokens) {
  try {
    if (typeof document === "undefined")
      return;
    if (tokens && tokens.role === "member" && tokens.accessToken) {
      const maxAge = Math.max(0, Math.floor((tokens.expiresAt - Date.now()) / 1e3));
      document.cookie = "gleam_at=" + encodeURIComponent(tokens.accessToken) + ";path=/;max-age=" + maxAge + ";secure;samesite=lax";
    } else {
      document.cookie = "gleam_at=;path=/;max-age=0;secure;samesite=lax";
    }
  } catch {
  }
}

const store = {
  load() {
    if (memory)
      return memory;
    if (typeof localStorage === "undefined")
      return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw)
        memory = JSON.parse(raw);
    } catch {
    }
    return memory;
  },
  save(tokens) {
    memory = tokens;
    syncLoginCookie(tokens);
    if (typeof localStorage === "undefined")
      return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } catch {
    }
  }
};

// Keep the cookie in step with whatever login is already on this device.
try {
  syncLoginCookie(store.load());
} catch {
}

async function mintTokens(body, role = "visitor") {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: WIX_CLIENT_ID, ...body })
  });
  if (!res.ok)
    throw new Error(`Wix auth failed (${res.status}).`);
  const data = await res.json();
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1e3, role };
}

function clearTokens() {
  try {
    PERSONAL_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
  }
  store.save({ accessToken: "", refreshToken: "", expiresAt: 0 });
}

// A valid access token: reuse it, refresh it, or start a visitor session.
async function accessToken() {
  const t = store.load();
  if (t && t.expiresAt - 6e4 > Date.now())
    return t.accessToken;
  let fresh;
  if (t?.refreshToken) {
    try {
      fresh = await mintTokens({ grantType: "refresh_token", refreshToken: t.refreshToken }, t.role ?? "visitor");
    } catch {
    }
  }
  fresh ?? (fresh = await mintTokens({ grantType: "anonymous" }));
  store.save(fresh);
  return fresh.accessToken;
}

// ---------------------------------------------------------------------------
// Calling Wix (or Gleam's own /api) with the current login
// ---------------------------------------------------------------------------

class WixApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    // The response's `details` as Wix sent it (applicationError, validationError).
    this.details = details;
  }
}

export async function wixRequest(path, { method = "POST", body, query } = {}) {
  const url = new URL(path, WIX_API_BASE);
  for (const [k, v] of Object.entries(query ?? {})) {
    for (const item of Array.isArray(v) ? v : [v])
      url.searchParams.append(k, String(item));
  }
  const res = await fetch(url, {
    method,
    headers: { Authorization: await accessToken(), "Content-Type": "application/json" },
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  if (!res.ok) {
    let message = "", code, details;
    try {
      const j = await res.json();
      message = j?.message ?? "";
      code = j?.details?.applicationError?.code;
      details = j?.details;
    } catch {
    }
    throw new WixApiError(message || `${method} ${url.pathname} failed (${res.status}).`, res.status, code, details);
  }
  return res.status === 204 ? null : await res.json();
}

// ---------------------------------------------------------------------------
// The logged-in member
// ---------------------------------------------------------------------------

async function fetchCurrentMember() {
  try {
    const res = await wixRequest("/members/v1/members/my", { method: "GET", query: { fieldsets: ["FULL"] } });
    const raw = res?.member;
    const id = raw?._id ?? raw?.id ?? "";
    if (!raw || !id)
      return null;
    const nickname = raw.profile?.nickname ?? "";
    const firstName = raw.contact?.firstName ?? "";
    const lastName = raw.contact?.lastName ?? "";
    const loginEmail = raw.loginEmail ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const created = raw._createdDate ?? raw.createdDate;
    return {
      id,
      loginEmail,
      displayName: nickname || fullName || loginEmail.split("@")[0] || "Member",
      firstName,
      lastName,
      nickname,
      contactId: raw.contactId ?? "",
      memberSince: created ? new Date(created).toISOString().slice(0, 10) : ""
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Log in, sign up, verify email, log out
// ---------------------------------------------------------------------------

const REDIRECT_SESSION = "/headless/v1/redirect-session";
const REST_STATES = {
  SUCCESS: "SUCCESS",
  REQUIRE_EMAIL_VERIFICATION: "EMAIL_VERIFICATION_REQUIRED",
  REQUIRE_OWNER_APPROVAL: "OWNER_APPROVAL_REQUIRED"
};
const NO_SESSION_ERROR = "Wix did not return a member session.";
const AUTH_ERROR_CODES = {
  MISSING_CAPTCHA: "-19971",
  INVALID_CAPTCHA: "-19970",
  EMAIL_EXISTS: "-19995",
  INVALID_PASSWORD: "-19976",
  RESET_PASSWORD: "-19973"
};
let pendingStateToken = null;

const failure = (error, errorCode) => ({ state: "FAILURE", error, ...errorCode ? { errorCode } : {} });
const message = (e) => e instanceof Error ? e.message : String(e);
// "I'm not a robot" answers, when the page has them.
const captcha = (options) => options.captchaTokens?.length ? { captcha_tokens: options.captchaTokens } : {};

function loginErrorCode(code) {
  switch (code) {
    case AUTH_ERROR_CODES.MISSING_CAPTCHA:
      return "missingCaptchaToken";
    case AUTH_ERROR_CODES.INVALID_CAPTCHA:
      return "invalidCaptchaToken";
    case AUTH_ERROR_CODES.INVALID_PASSWORD:
      return "invalidPassword";
    case AUTH_ERROR_CODES.RESET_PASSWORD:
      return "resetPassword";
    default:
      return "invalidEmail";
  }
}

function registerErrorCode(code, details) {
  const violations = details?.validationError?.fieldViolations ?? [];
  if (violations.some((v) => v?.data?.type === "EMAIL"))
    return "invalidEmail";
  switch (code) {
    case AUTH_ERROR_CODES.MISSING_CAPTCHA:
      return "missingCaptchaToken";
    case AUTH_ERROR_CODES.EMAIL_EXISTS:
      return "emailAlreadyExists";
    case AUTH_ERROR_CODES.INVALID_CAPTCHA:
      return "invalidCaptchaToken";
    default:
      return void 0;
  }
}

// Turns a Wix login/sign-up/verify answer into a result for the page.
async function finish(raw) {
  const state = raw?.loginState ?? REST_STATES[raw?.state ?? ""] ?? "FAILURE";
  const stateToken = raw?.stateToken ?? raw?.data?.stateToken;
  const sessionToken = raw?.data?.sessionToken ?? raw?.sessionToken ?? null;
  if (state === "SUCCESS") {
    pendingStateToken = null;
    if (!sessionToken)
      return failure(NO_SESSION_ERROR);
    store.save(await memberTokensForSession(sessionToken));
    return { state: "SUCCESS" };
  }
  if (stateToken)
    pendingStateToken = stateToken;
  return {
    state,
    ...stateToken ? { stateToken } : {},
    ...raw?.errorCode ? { errorCode: raw.errorCode } : {},
    ...raw?.error ? { error: raw.error } : {}
  };
}

async function loginMember(email, password, options = {}) {
  let raw;
  try {
    raw = await wixRequest("/_api/iam/authentication/v2/login", { body: { loginId: { email }, password, ...captcha(options) } });
  } catch (e) {
    return failure(message(e), e instanceof WixApiError ? loginErrorCode(e.code) : void 0);
  }
  return finish(raw);
}

async function registerMember(email, password, profile, options = {}) {
  let raw;
  try {
    raw = await wixRequest("/_api/iam/authentication/v2/register", {
      body: { loginId: { email }, password, ...profile ? { profile } : {}, ...captcha(options) }
    });
  } catch (e) {
    return failure(message(e), e instanceof WixApiError ? registerErrorCode(e.code, e.details) : void 0);
  }
  return finish(raw);
}

async function verifyMemberEmail(verificationCode) {
  if (!pendingStateToken)
    return failure("No sign-in is waiting for a verification code.");
  let raw;
  try {
    raw = await wixRequest("/_api/iam/verification/v1/auth/verify", { body: { code: verificationCode, stateToken: pendingStateToken } });
  } catch (e) {
    return failure(message(e));
  }
  return finish(raw);
}

async function logoutMember(returnTo = "/") {
  const target = new URL(returnTo, window.location.origin).href;
  const res = await wixRequest(REDIRECT_SESSION, { body: { logout: { clientId: WIX_CLIENT_ID }, callbacks: { postFlowUrl: target } } });
  const url = res?.redirectSession?.fullUrl;
  if (!url)
    throw new Error("Logout couldn't start: no redirect URL returned.");
  clearTokens();
  window.location.assign(url);
}

// Swaps a one-time Wix session token for member login tokens (PKCE, in a hidden frame).
async function memberTokensForSession(sessionToken) {
  const { verifier, challenge } = await pkce();
  const state = randomString();
  const res = await wixRequest(REDIRECT_SESSION, {
    body: {
      auth: {
        authRequest: {
          clientId: WIX_CLIENT_ID,
          codeChallenge: challenge,
          codeChallengeMethod: "S256",
          responseMode: "web_message",
          responseType: "code",
          scope: "offline_access",
          state,
          sessionToken
        },
        prompt: "none"
      }
    }
  });
  const url = res?.redirectSession?.fullUrl;
  if (!url)
    throw new Error("Login couldn't finish: no authorization URL returned.");
  const code = await authorizationCode(url, state);
  return mintTokens({ grantType: "authorization_code", code, codeVerifier: verifier }, "member");
}

function authorizationCode(url, state) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    const done = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      frame.remove();
    };
    const onMessage = (e) => {
      const data = e.data;
      if (!data || data.state !== state)
        return;
      done();
      if (data.error)
        reject(new Error(`Login was refused: ${data.error}`));
      else if (data.code)
        resolve(data.code);
      else
        reject(new Error("Login couldn't finish: no authorization code."));
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error("Login timed out. Is this page's origin on the OAuth app's allowed domains?"));
    }, 12e4);
    window.addEventListener("message", onMessage);
    frame.src = url;
    document.body.appendChild(frame);
  });
}

function base64url(bytes) {
  let s = "";
  for (const b of bytes)
    s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function pkce() {
  const verifier = randomString();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

// ---------------------------------------------------------------------------
// Member state the pages subscribe to
// ---------------------------------------------------------------------------

let state = { member: null, loggedIn: false, loading: true, error: null };
const listeners = new Set();
let started = false;

function setState(patch) {
  state = { ...state, ...patch };
  for (const l of listeners)
    l();
}

export function getMemberState() {
  return state;
}

export function subscribeMember(listener) {
  listeners.add(listener);
  if (!started && typeof window !== "undefined") {
    started = true;
    void refreshMember();
  }
  return () => listeners.delete(listener);
}

async function refreshMember() {
  setState({ loading: true, error: null });
  if (store.load()?.role !== "member") {
    setState({ member: null, loggedIn: false, loading: false });
    return;
  }
  const member = await fetchCurrentMember();
  setState({ member, loggedIn: true, loading: false });
}

async function runLogin(action) {
  try {
    const result = await action();
    if (result.state === "SUCCESS")
      await refreshMember();
    if (result.state === "FAILURE")
      setState({ error: result.error ?? result.errorCode ?? "Could not log in." });
    return result;
  } catch (e) {
    setState({ error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export function login(email, password, options) {
  return runLogin(() => loginMember(email, password, options));
}

export function register(email, password, profile, options) {
  return runLogin(() => registerMember(email, password, profile, options));
}

export function verifyEmail(code) {
  return runLogin(() => verifyMemberEmail(code));
}

export async function logout(returnTo) {
  setState({ member: null, loggedIn: false });
  try {
    await logoutMember(returnTo);
  } catch (e) {
    setState({ error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
