// Google sign-in for the two owners (Sean & Blue). No dependencies, no database.
//
// Flow (Google Identity Services, ux_mode=redirect): the page shows Google's button → Google POSTs an ID token to
// /api/auth → we verify it (Google's RS256 signature, audience, expiry, verified e-mail), check the e-mail against
// ALLOWED_EMAILS, and answer with our own signed, HttpOnly session cookie. Nothing is stored server-side.
//
// Vercel → Project → Settings → Environment Variables:
//   GOOGLE_CLIENT_ID   OAuth "Web application" client ID (public value)
//   ALLOWED_EMAILS     comma-separated Google accounts allowed in, e.g. sean@gmail.com,blue@gmail.com
//   SESSION_SECRET     random string, ≥ 32 characters (signs the session cookie; changing it signs everyone out)
import { createHmac, createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'aethersky_session';
export const SESSION_DAYS = 30;
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');
const fail = (code) => Object.assign(new Error(code), { code });

export function allowedEmails(env) {
  return new Set(String(env.ALLOWED_EMAILS || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')));
}

export const authConfigured = (env) =>
  !!(env.GOOGLE_CLIENT_ID && String(env.SESSION_SECRET || '').length >= 32 && allowedEmails(env).size);

/** Whole tracker sync works only when sign-in AND the GitHub token are set. */
export const syncConfigured = (env) => authConfigured(env) && !!env.TRACKERS_GITHUB_TOKEN;

// ── Google ID token ─────────────────────────────────────────────────────────
const certCaches = new WeakMap(); // per fetch implementation, so tests never see production keys

async function googleKeys(fetchImpl, now, refresh) {
  const cache = certCaches.get(fetchImpl);
  if (cache && !refresh && now < cache.until) return cache.keys;
  const res = await fetchImpl(CERTS_URL);
  if (!res.ok) throw fail('certs-unavailable');
  const { keys } = await res.json();
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1]) || 3600;
  certCaches.set(fetchImpl, { keys, until: now + maxAge * 1000 });
  return keys;
}

/** Verifies a Google ID token and returns { email, name }. Throws an Error with a `code` when anything is off. */
export async function verifyGoogleIdToken(token, { clientId, fetchImpl = fetch, now = Date.now() }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw fail('bad-token');
  let header;
  let claims;
  try {
    header = JSON.parse(fromB64u(parts[0]));
    claims = JSON.parse(fromB64u(parts[1]));
  } catch {
    throw fail('bad-token');
  }
  if (header.alg !== 'RS256' || !header.kid) throw fail('bad-token');

  let jwk = (await googleKeys(fetchImpl, now, false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await googleKeys(fetchImpl, now, true)).find((k) => k.kid === header.kid); // key rotation
  if (!jwk) throw fail('bad-signature');
  const valid = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(createPublicKey({ key: jwk, format: 'jwk' }), fromB64u(parts[2]));
  if (!valid) throw fail('bad-signature');

  if (!ISSUERS.includes(claims.iss)) throw fail('bad-issuer');
  if (!clientId || claims.aud !== clientId) throw fail('bad-audience');
  if (!(claims.exp * 1000 > now)) throw fail('expired');
  if (claims.iat * 1000 > now + 5 * 60 * 1000) throw fail('bad-token');
  if (!(claims.email_verified === true || claims.email_verified === 'true') || typeof claims.email !== 'string') throw fail('email-unverified');
  return { email: claims.email.toLowerCase(), name: String(claims.name || '').slice(0, 60) };
}

// ── Our own session cookie ──────────────────────────────────────────────────
const mac = (payload, secret) => b64u(createHmac('sha256', secret).update(payload).digest());

export function signSession(user, secret, { now = Date.now(), days = SESSION_DAYS } = {}) {
  const payload = b64u(JSON.stringify({ e: user.email, n: user.name || '', x: Math.floor(now / 1000) + days * 86400 }));
  return `${payload}.${mac(payload, secret)}`;
}

export function readSession(token, secret, now = Date.now()) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || !secret) return null;
  const want = Buffer.from(mac(payload, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(fromB64u(payload));
    return s.x * 1000 > now && typeof s.e === 'string' ? { email: s.e, name: s.n || '' } : null;
  } catch {
    return null;
  }
}

export function cookieValue(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export const sessionCookie = (token, { days = SESSION_DAYS } = {}) =>
  `${COOKIE}=${token}; Path=/; Max-Age=${days * 86400}; HttpOnly; Secure; SameSite=Lax`;
export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** The signed-in user, or null. Removing an e-mail from ALLOWED_EMAILS revokes its sessions immediately. */
export function currentUser(request, env, now = Date.now()) {
  if (!authConfigured(env)) return null;
  const user = readSession(cookieValue(request, COOKIE), env.SESSION_SECRET, now);
  return user && allowedEmails(env).has(user.email) ? user : null;
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

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
