// Two passwords, one per person (USERA, USERB). No accounts, no extra service, no dependencies.
//
// The password itself says who is signing in: /api/auth checks it against each person's password and, on a match,
// answers with a signed HttpOnly session cookie naming that person ("remember me" ticked → 90 days, otherwise until the
// browser closes). Everything that spends SerpApi quota (the trackers the daily scan searches for) sits behind that
// cookie; the public pages never spend quota.
//
// Two layers of passwords:
//   1. INITIAL passwords, from Vercel env PASSWORD_USERA / PASSWORD_USERB. They only get you as far as the
//      "choose your own password" screen — tracker sync stays locked until you have changed it.
//   2. Your OWN password, stored as a salted scrypt hash in the repository variable AUTH (never the password itself).
//      Once it exists it replaces the initial one. Forgot it? Delete your entry from the AUTH variable (or the whole
//      variable) in GitHub → the initial password works again and asks for a new one.
//
// Vercel → Project → Settings → Environment Variables:
//   PASSWORD_USERA, PASSWORD_USERB   initial passwords, each ≥ 12 characters and different from each other.
//                                  The name after PASSWORD_ is the person's code (matches `people` in config/routes.json);
//                                  only names of the form USER<letter> are read.
//   SESSION_SECRET                 random string, ≥ 32 characters (signs the cookie; changing it signs everyone out)
//   TRACKERS_GITHUB_TOKEN          (also stores the AUTH variable) — see api/trackers.mjs
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { variables } from './github.mjs';

const scryptAsync = promisify(scrypt);

export const COOKIE = 'aethersky_session';
export const REMEMBER_DAYS = 90; // "remember me" ticked: a persistent cookie, refreshed whenever the app is opened late in its life
export const SESSION_HOURS = 24; // not ticked: a browser-session cookie whose token also lapses after a day
export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 128;
export const MIN_SECRET = 32;
export const AUTH_VAR = 'AUTH';
const CACHE_MS = 20 * 1000; // other server instances notice a password change within this long

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// ── Configuration (Vercel env) ──────────────────────────────────────────────
/** { usera: '…', userb: '…' } from PASSWORD_USERA / PASSWORD_USERB (only the names PASSWORD_USER<letter> count; anything
 *  else is ignored). Too-short or duplicated passwords are ignored. */
export function passwords(env) {
  const all = Object.entries(env)
    .map(([k, v]) => [/^PASSWORD_(USER[A-Z])$/.exec(k)?.[1]?.toLowerCase(), String(v || '')])
    .filter(([name, pw]) => name && pw.length >= MIN_PASSWORD);
  const counts = new Map();
  for (const [, pw] of all) counts.set(pw, (counts.get(pw) || 0) + 1);
  return Object.fromEntries(all.filter(([, pw]) => counts.get(pw) === 1));
}

export const authConfigured = (env) => String(env.SESSION_SECRET || '').length >= MIN_SECRET && Object.keys(passwords(env)).length > 0;

/** Whole tracker sync works only when sign-in AND the GitHub token (which also stores passwords) are set. */
export const syncConfigured = (env) => authConfigured(env) && !!env.TRACKERS_GITHUB_TOKEN;

/** Which variables are missing or unusable — names only, never values — so a bad setup can be diagnosed from /api/auth. */
export function syncProblems(env) {
  const problems = [];
  const raw = Object.entries(env).filter(([k]) => /^PASSWORD_USER[A-Z]$/.test(k) && env[k]);
  const usable = passwords(env);
  if (!raw.length) problems.push('PASSWORD_USERA', 'PASSWORD_USERB');
  for (const [k, v] of raw) {
    const name = k.slice('PASSWORD_'.length).toLowerCase();
    if (String(v).length < MIN_PASSWORD) problems.push(`${k} (needs at least ${MIN_PASSWORD} characters)`);
    else if (!(name in usable)) problems.push(`${k} (same as another password — each person needs their own)`);
  }
  if (!env.SESSION_SECRET) problems.push('SESSION_SECRET');
  else if (String(env.SESSION_SECRET).length < MIN_SECRET) problems.push(`SESSION_SECRET (needs at least ${MIN_SECRET} characters)`);
  if (!env.TRACKERS_GITHUB_TOKEN) problems.push('TRACKERS_GITHUB_TOKEN');
  return problems;
}

// ── Password hashes (scrypt) ────────────────────────────────────────────────
const SCRYPT = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64u(salt)}$${b64u(key)}`;
}

export async function verifyHash(password, stored) {
  const [alg, N, r, p, salt, key] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !key) return false;
  try {
    const want = fromB64u(key);
    const got = await scryptAsync(String(password), fromB64u(salt), want.length, { N: Number(N), r: Number(r), p: Number(p) });
    return got.length === want.length && timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

// ── Where changed passwords live: the AUTH repository variable ─────────────
// State shape: { usera: { hash, at }, userb: { hash, at } } — only people who have chosen their own password.
const cleanState = (v) => {
  const out = {};
  for (const [name, e] of Object.entries(v && typeof v === 'object' && !Array.isArray(v) ? v : {})) {
    if (e && typeof e.hash === 'string') out[name] = { hash: e.hash, at: String(e.at || '') };
  }
  return out;
};
const caches = new WeakMap(); // per fetch implementation, so tests never see production state

export function authStore(env, fetchImpl = fetch) {
  const gh = variables(env, fetchImpl);
  const key = env.TRACKERS_REPO || '';
  const cache = () => {
    if (!caches.has(fetchImpl)) caches.set(fetchImpl, new Map());
    return caches.get(fetchImpl);
  };
  const fresh = async () => {
    const raw = await gh.read(AUTH_VAR); // any GitHub / network failure throws → callers fail closed
    let state = {};
    try {
      state = cleanState(JSON.parse(raw || '{}'));
    } catch {
      /* a variable holding junk just means "nobody has changed their password yet" */
    }
    cache().set(key, { state, until: Date.now() + CACHE_MS });
    return state;
  };
  return {
    /** Everyone's own-password hashes; cached for a few seconds. Throws when GitHub cannot be reached. */
    async load({ force = false } = {}) {
      const hit = cache().get(key);
      return !force && hit && hit.until > Date.now() ? hit.state : fresh();
    },
    /** Record `name`'s new password hash (re-reads first so a change by the other person is not lost). */
    async setHash(name, hash, at) {
      const state = await fresh();
      state[name] = { hash, at };
      await gh.write(AUTH_VAR, JSON.stringify(state));
      cache().set(key, { state, until: Date.now() + CACHE_MS });
      return state;
    },
  };
}

// ── Who is this password? ───────────────────────────────────────────────────
/** Does `password` match `name`'s CURRENT password (their own if they chose one, otherwise the initial one)? */
export async function matches(name, password, env, own) {
  if (typeof password !== 'string' || !password) return false;
  if (own[name]?.hash) return verifyHash(password, own[name].hash);
  const initial = passwords(env)[name];
  return !!initial && safeEqual(password, initial);
}

/** The single person whose current password this is, or null (no match, or ambiguous). */
export async function whoIs(password, env, own) {
  const hits = [];
  for (const name of Object.keys(passwords(env))) if (await matches(name, password, env, own)) hits.push(name);
  return hits.length === 1 ? hits[0] : null;
}

// ── Our own session cookie ──────────────────────────────────────────────────
const mac = (payload, secret) => b64u(createHmac('sha256', secret).update(payload).digest());
// Ties a cookie to the password it was issued for: choosing a new password signs that person out everywhere else.
const credentialId = (name, env, own) => (own[name]?.hash ? `h:${own[name].hash}` : `i:${passwords(env)[name]}`);
const fingerprint = (name, env, own) => mac(`pw:${name}:${credentialId(name, env, own)}`, env.SESSION_SECRET).slice(0, 16);

export function signSession(name, env, own, { now = Date.now(), remember = false } = {}) {
  const seconds = remember ? REMEMBER_DAYS * 86400 : SESSION_HOURS * 3600;
  const payload = b64u(JSON.stringify({ p: name, f: fingerprint(name, env, own), x: Math.floor(now / 1000) + seconds, r: remember ? 1 : 0 }));
  return `${payload}.${mac(payload, env.SESSION_SECRET)}`;
}

/** { name, remember, exp } for a valid session token (bad signature, expired, person removed, or password changed since → null). */
export function parseSession(token, env, own, now = Date.now()) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || !authConfigured(env)) return null;
  if (!safeEqual(sig, mac(payload, env.SESSION_SECRET))) return null;
  try {
    const s = JSON.parse(fromB64u(payload));
    if (!(s.x * 1000 > now) || !(s.p in passwords(env))) return null;
    return safeEqual(s.f, fingerprint(s.p, env, own)) ? { name: s.p, remember: s.r === 1, exp: s.x } : null;
  } catch {
    return null;
  }
}

/** The signed-in person's name, or null. */
export const readSession = (token, env, own, now = Date.now()) => parseSession(token, env, own, now)?.name ?? null;

export function cookieValue(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// Remembered → persistent cookie; otherwise no Max-Age, so the browser drops it when it closes.
export const sessionCookie = (token, { remember = false } = {}) =>
  `${COOKIE}=${token}; Path=/;${remember ? ` Max-Age=${REMEMBER_DAYS * 86400};` : ''} HttpOnly; Secure; SameSite=Lax`;
export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** { name, mustChange, remember, exp } for the signed-in person, or null. mustChange = still on the initial password. */
export function currentUser(request, env, own, now = Date.now()) {
  const s = parseSession(cookieValue(request, COOKIE), env, own, now);
  return s ? { name: s.name, mustChange: !own[s.name]?.hash, remember: s.remember, exp: s.exp } : null;
}

/** Why a proposed new password is not acceptable, or null when it is fine. */
export async function passwordProblem(next, { name, current, env, own }) {
  if (typeof next !== 'string' || next.length < MIN_PASSWORD) return 'too-short';
  if (next.length > MAX_PASSWORD) return 'too-long';
  if (next === current) return 'same-as-current';
  if (passwords(env)[name] === next) return 'same-as-initial'; // the initial password is known to whoever set it up
  for (const other of Object.keys(passwords(env))) if (other !== name && (await matches(other, next, env, own))) return 'taken';
  return null;
}

/** Same-origin check for state-changing requests (cookies are sent automatically, so verify who is asking). */
export function sameOrigin(request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return request.headers.get('sec-fetch-site') === 'same-origin';
}
