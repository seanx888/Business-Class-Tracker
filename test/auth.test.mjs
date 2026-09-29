import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyGoogleIdToken, signSession, readSession, currentUser, sameOrigin, allowedEmails, authConfigured, syncConfigured, COOKIE } from '../web/api/_lib/auth.mjs';
import { handle } from '../web/api/auth.mjs';

const CLIENT = '1234-abc.apps.googleusercontent.com';
const NOW = Date.parse('2026-09-30T00:00:00Z');
const env = { GOOGLE_CLIENT_ID: CLIENT, ALLOWED_EMAILS: 'Sean@Gmail.com, blue@gmail.com', SESSION_SECRET: 's'.repeat(40), TRACKERS_GITHUB_TOKEN: 'ghp_x' };

// A stand-in for Google: our own RSA key published as a JWKS.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] };
const fetchImpl = async () => Response.json(jwks, { headers: { 'cache-control': 'public, max-age=600' } });

const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function idToken(claims = {}, { kid = 'k1', key = privateKey } = {}) {
  const head = b64u({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64u({
    iss: 'https://accounts.google.com', aud: CLIENT, email: 'sean@gmail.com', email_verified: true, name: 'Sean',
    iat: NOW / 1000 - 10, exp: NOW / 1000 + 3600, ...claims,
  });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const verify = (token, extra = {}) => verifyGoogleIdToken(token, { clientId: CLIENT, fetchImpl, now: NOW, ...extra });
const rejects = (p, code) => assert.rejects(p, (e) => e.code === code, `expected ${code}`);

test('Google ID token: valid token → lower-cased e-mail', async () => {
  assert.deepEqual(await verify(idToken({ email: 'Sean@Gmail.com' })), { email: 'sean@gmail.com', name: 'Sean' });
});

test('Google ID token: forged signature, wrong audience/issuer, expired, unverified e-mail are all refused', async () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await rejects(verify(idToken({}, { key: other })), 'bad-signature');
  await rejects(verify(idToken({}, { kid: 'unknown' })), 'bad-signature');
  await rejects(verify(idToken({ aud: 'someone-elses-app' })), 'bad-audience');
  await rejects(verify(idToken({ iss: 'https://evil.example' })), 'bad-issuer');
  await rejects(verify(idToken({ exp: NOW / 1000 - 1 })), 'expired');
  await rejects(verify(idToken({ email_verified: false })), 'email-unverified');
  await rejects(verify('not.a.jwt'), 'bad-token');
  await rejects(verify(''), 'bad-token');
  const alg = `${b64u({ alg: 'none', kid: 'k1' })}.${b64u({ aud: CLIENT })}.`;
  await rejects(verify(alg), 'bad-token');
});

test('session cookie: signed, expires, tamper-proof, revoked when removed from ALLOWED_EMAILS', () => {
  const token = signSession({ email: 'sean@gmail.com', name: 'Sean' }, env.SESSION_SECRET, { now: NOW });
  assert.deepEqual(readSession(token, env.SESSION_SECRET, NOW + 1000), { email: 'sean@gmail.com', name: 'Sean' });
  assert.equal(readSession(token, env.SESSION_SECRET, NOW + 31 * 86400 * 1000), null, 'expired after 30 days');
  assert.equal(readSession(token, 'x'.repeat(40), NOW), null, 'wrong secret');
  const [payload, sig] = token.split('.');
  const forged = `${Buffer.from(JSON.stringify({ e: 'evil@x.com', x: NOW / 1000 + 999999 })).toString('base64url')}.${sig}`;
  assert.equal(readSession(forged, env.SESSION_SECRET, NOW), null, 'payload swapped');
  assert.equal(readSession(payload, env.SESSION_SECRET, NOW), null);

  const req = new Request('https://app.example/api/x', { headers: { cookie: `a=1; ${COOKIE}=${token}` } });
  assert.equal(currentUser(req, env, NOW)?.email, 'sean@gmail.com');
  assert.equal(currentUser(req, { ...env, ALLOWED_EMAILS: 'blue@gmail.com' }, NOW), null, 'no longer allowed');
  assert.equal(currentUser(req, { ...env, SESSION_SECRET: 'short' }, NOW), null, 'auth not configured');
});

test('configuration checks', () => {
  assert.deepEqual([...allowedEmails(env)], ['sean@gmail.com', 'blue@gmail.com']);
  assert.equal(authConfigured(env), true);
  assert.equal(authConfigured({ ...env, SESSION_SECRET: 'too-short' }), false);
  assert.equal(authConfigured({ ...env, ALLOWED_EMAILS: '' }), false);
  assert.equal(syncConfigured({ ...env, TRACKERS_GITHUB_TOKEN: '' }), false);
  assert.equal(syncConfigured(env), true);
});

test('sameOrigin: own origin only; missing headers are not enough', () => {
  const r = (h) => new Request('https://app.example/api/trackers', { method: 'PUT', headers: h });
  assert.equal(sameOrigin(r({ origin: 'https://app.example', host: 'app.example' })), true);
  assert.equal(sameOrigin(r({ origin: 'https://evil.example', host: 'app.example' })), false);
  assert.equal(sameOrigin(r({ 'sec-fetch-site': 'same-origin' })), true);
  assert.equal(sameOrigin(r({ 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(sameOrigin(r({})), false);
});

const post = (fields, cookie = '') => new Request('https://app.example/api/auth', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
  body: new URLSearchParams(fields).toString(),
});
const opts = { env, fetchImpl, now: NOW, delayMs: 0 };

test('POST /api/auth: allowed Google account gets an HttpOnly session and lands back in the app', async () => {
  const res = await handle(post({ credential: idToken(), g_csrf_token: 'csrf1' }, 'g_csrf_token=csrf1'), opts);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/#/settings');
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, new RegExp(`^${COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  const who = await handle(new Request('https://app.example/api/auth', { headers: { cookie: cookie.split(';')[0] } }), opts);
  assert.deepEqual(await who.json(), { configured: true, clientId: CLIENT, user: { email: 'sean@gmail.com', name: 'Sean' } });
});

test('POST /api/auth: strangers, missing/mismatched CSRF and bad tokens never get a cookie', async () => {
  const stranger = await handle(post({ credential: idToken({ email: 'stranger@gmail.com' }), g_csrf_token: 'c' }, 'g_csrf_token=c'), opts);
  assert.equal(stranger.headers.get('location'), '/?signin=denied#/settings');
  assert.equal(stranger.headers.get('set-cookie'), null);
  const noCsrf = await handle(post({ credential: idToken() }), opts);
  assert.equal(noCsrf.headers.get('location'), '/?signin=error#/settings');
  assert.equal(noCsrf.headers.get('set-cookie'), null);
  const mismatch = await handle(post({ credential: idToken(), g_csrf_token: 'a' }, 'g_csrf_token=b'), opts);
  assert.equal(mismatch.headers.get('set-cookie'), null);
  const forged = await handle(post({ credential: idToken({}, { key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }), g_csrf_token: 'c' }, 'g_csrf_token=c'), opts);
  assert.equal(forged.headers.get('location'), '/?signin=denied#/settings');
  assert.equal(forged.headers.get('set-cookie'), null);
});

test('GET /api/auth is public and reveals nothing when signed out; unconfigured servers say so', async () => {
  const out = await (await handle(new Request('https://app.example/api/auth'), opts)).json();
  assert.deepEqual(out, { configured: true, clientId: CLIENT, user: null });
  const off = await (await handle(new Request('https://app.example/api/auth'), { ...opts, env: {} })).json();
  assert.deepEqual(off, { configured: false, clientId: null, user: null });
  assert.equal((await handle(post({}), { ...opts, env: {} })).status, 501);
});

test('DELETE /api/auth signs out, but only from our own origin', async () => {
  const bad = await handle(new Request('https://app.example/api/auth', { method: 'DELETE', headers: { origin: 'https://evil.example', host: 'app.example' } }), opts);
  assert.equal(bad.status, 403);
  const ok = await handle(new Request('https://app.example/api/auth', { method: 'DELETE', headers: { origin: 'https://app.example', host: 'app.example' } }), opts);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /Max-Age=0/);
});
