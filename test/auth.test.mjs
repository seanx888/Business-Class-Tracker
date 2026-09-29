import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  passwords, whoIs, matches, hashPassword, verifyHash, authStore, signSession, readSession, currentUser, passwordProblem,
  sameOrigin, authConfigured, syncConfigured, syncProblems, COOKIE, AUTH_VAR,
} from '../web/api/_lib/auth.mjs';
import { handle } from '../web/api/auth.mjs';
import { fakeGitHub } from './helpers/github.mjs';

const NOW = Date.parse('2026-09-30T00:00:00Z');
const INITIAL = { sean: 'sean-initial-pass-1', blue: 'blue-initial-pass-2' };
const env = { PASSWORD_SEAN: INITIAL.sean, PASSWORD_BLUE: INITIAL.blue, SESSION_SECRET: 's'.repeat(40), TRACKERS_GITHUB_TOKEN: 'ghp_x', TRACKERS_REPO: 'me/repo' };
const same = { origin: 'https://app.example', host: 'app.example', 'content-type': 'application/json' };
const call = (method, body, { headers = same, cookie } = {}) =>
  new Request('https://app.example/api/auth', { method, headers: { ...headers, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const run = (request, gh, extra = {}) => handle(request, { env, now: NOW, delayMs: 0, fetchImpl: gh.fetchImpl, ...extra });
const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];

test('the password itself says who is signing in', async () => {
  assert.deepEqual(passwords(env), { sean: INITIAL.sean, blue: INITIAL.blue });
  assert.equal(await whoIs(INITIAL.sean, env, {}), 'sean');
  assert.equal(await whoIs(INITIAL.blue, env, {}), 'blue');
  for (const bad of ['nope', '', INITIAL.sean.slice(1), INITIAL.sean.toUpperCase(), ` ${INITIAL.sean}`, undefined, 12345]) assert.equal(await whoIs(bad, env, {}), null, String(bad));
});

test('short or duplicated initial passwords are ignored, never accepted', async () => {
  assert.deepEqual(passwords({ PASSWORD_SEAN: 'short', PASSWORD_BLUE: INITIAL.blue }), { blue: INITIAL.blue });
  const dup = { PASSWORD_SEAN: 'exactly-the-same', PASSWORD_BLUE: 'exactly-the-same' };
  assert.deepEqual(passwords(dup), {}, 'two people cannot share a password — nobody could be told apart');
  assert.equal(await whoIs('exactly-the-same', dup, {}), null);
  assert.deepEqual(passwords({ PASSWORD_: 'x'.repeat(20), password_sean: 'x'.repeat(20), OTHER: 'x'.repeat(20) }), {});
});

test('scrypt hashes: salted, verifiable, never contain the password', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  assert.notEqual(a, b, 'random salt');
  assert.match(a, /^scrypt\$16384\$8\$1\$/);
  assert.ok(!a.includes('correct'));
  assert.equal(await verifyHash('correct horse battery', a), true);
  assert.equal(await verifyHash('correct horse batterz', a), false);
  assert.equal(await verifyHash('x', 'garbage'), false);
  assert.equal(await verifyHash('x', ''), false);
});

test('a password someone chose replaces the initial one', async () => {
  const own = { sean: { hash: await hashPassword('sean-own-password-9'), at: '' } };
  assert.equal(await whoIs('sean-own-password-9', env, own), 'sean');
  assert.equal(await whoIs(INITIAL.sean, env, own), null, 'the initial password stops working');
  assert.equal(await whoIs(INITIAL.blue, env, own), 'blue', 'Blue is unaffected');
  assert.equal(await matches('sean', INITIAL.sean, env, own), false);
});

test('configuration checks and problem report (names only, never values)', () => {
  assert.equal(authConfigured(env), true);
  assert.equal(syncConfigured(env), true);
  assert.equal(authConfigured({ ...env, SESSION_SECRET: 'too-short' }), false);
  assert.equal(authConfigured({ ...env, PASSWORD_SEAN: undefined, PASSWORD_BLUE: undefined }), false);
  assert.equal(syncConfigured({ ...env, TRACKERS_GITHUB_TOKEN: '' }), false);
  assert.deepEqual(syncProblems(env), []);
  assert.deepEqual(syncProblems({}), ['PASSWORD_SEAN', 'PASSWORD_BLUE', 'SESSION_SECRET', 'TRACKERS_GITHUB_TOKEN']);
  const bad = { ...env, PASSWORD_BLUE: 'shortpw', SESSION_SECRET: 'secret-but-short' };
  assert.deepEqual(syncProblems(bad), ['PASSWORD_BLUE (needs at least 12 characters)', 'SESSION_SECRET (needs at least 32 characters)']);
  assert.deepEqual(
    syncProblems({ ...env, PASSWORD_BLUE: env.PASSWORD_SEAN }),
    ['PASSWORD_SEAN (same as another password — each person needs their own)', 'PASSWORD_BLUE (same as another password — each person needs their own)'],
  );
  const leaked = JSON.stringify(syncProblems(bad));
  assert.ok(!leaked.includes('shortpw') && !leaked.includes('secret-but-short') && !leaked.includes('sean-initial'));
});

test('session cookie: signed, expires, tamper-proof', () => {
  const token = signSession('sean', env, {}, { now: NOW });
  assert.equal(readSession(token, env, {}, NOW + 1000), 'sean');
  assert.equal(readSession(token, env, {}, NOW + 31 * 86400 * 1000), null, 'expires after 30 days');
  assert.equal(readSession(token, { ...env, SESSION_SECRET: 'x'.repeat(40) }, {}, NOW), null, 'wrong secret');
  const [payload, sig] = token.split('.');
  const forged = `${Buffer.from(JSON.stringify({ p: 'blue', f: 'x', x: NOW / 1000 + 999999 })).toString('base64url')}.${sig}`;
  assert.equal(readSession(forged, env, {}, NOW), null, 'payload swapped');
  assert.equal(readSession(payload, env, {}, NOW), null);
  assert.equal(readSession('', env, {}, NOW), null);
});

test('a cookie dies when that person changes password or is removed; the other person is unaffected', async () => {
  const seanToken = signSession('sean', env, {}, { now: NOW });
  const blueToken = signSession('blue', env, {}, { now: NOW });
  const req = (t) => new Request('https://app.example/api/x', { headers: { cookie: `a=1; ${COOKIE}=${t}` } });
  assert.deepEqual(currentUser(req(seanToken), env, {}, NOW), { name: 'sean', mustChange: true });
  const own = { sean: { hash: await hashPassword('sean-own-password-9'), at: '' } };
  assert.equal(currentUser(req(seanToken), env, own, NOW), null, 'chose a new password → old cookie invalid');
  assert.deepEqual(currentUser(req(blueToken), env, own, NOW), { name: 'blue', mustChange: true });
  assert.deepEqual(currentUser(req(signSession('sean', env, own, { now: NOW })), env, own, NOW), { name: 'sean', mustChange: false });
  assert.equal(currentUser(req(seanToken), { ...env, PASSWORD_SEAN: undefined }, {}, NOW), null, 'removed');
});

test('passwordProblem: length, same as current / initial, and taken by the other person', async () => {
  const ctx = { name: 'sean', current: INITIAL.sean, env, own: {} };
  assert.equal(await passwordProblem('a-perfectly-fine-one', ctx), null);
  assert.equal(await passwordProblem('short', ctx), 'too-short');
  assert.equal(await passwordProblem('x'.repeat(129), ctx), 'too-long');
  assert.equal(await passwordProblem(INITIAL.sean, ctx), 'same-as-current');
  assert.equal(await passwordProblem(INITIAL.blue, ctx), 'taken');
  assert.equal(await passwordProblem(INITIAL.sean, { ...ctx, current: 'sean-own-password-9' }), 'same-as-initial');
  assert.equal(await passwordProblem(undefined, ctx), 'too-short');
});

test('sameOrigin: own origin only; missing headers are not enough', () => {
  const r = (h) => new Request('https://app.example/api/trackers', { method: 'PUT', headers: h });
  assert.equal(sameOrigin(r({ origin: 'https://app.example', host: 'app.example' })), true);
  assert.equal(sameOrigin(r({ origin: 'https://evil.example', host: 'app.example' })), false);
  assert.equal(sameOrigin(r({ 'sec-fetch-site': 'same-origin' })), true);
  assert.equal(sameOrigin(r({ 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(sameOrigin(r({})), false);
});

test('sign in with the initial password → cookie, but flagged mustChange', async () => {
  const gh = fakeGitHub();
  for (const name of ['sean', 'blue']) {
    const res = await run(call('POST', { password: INITIAL[name] }), gh);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { user: { name, mustChange: true } });
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, new RegExp(`^${COOKIE}=`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    const who = await run(call('GET', null, { cookie: cookieOf(res) }), gh);
    assert.deepEqual(await who.json(), { configured: true, user: { name, mustChange: true }, problems: [] });
  }
});

test('wrong passwords never get a cookie; only from our own page and only JSON', async () => {
  const gh = fakeGitHub();
  for (const pw of ['nope', '', INITIAL.sean.slice(1), INITIAL.sean.toUpperCase(), ` ${INITIAL.sean}`, 12345, null]) {
    const res = await run(call('POST', { password: pw }), gh);
    assert.equal(res.status, 401, JSON.stringify(pw));
    assert.equal(res.headers.get('set-cookie'), null);
  }
  assert.equal((await run(new Request('https://app.example/api/auth', { method: 'POST', headers: same, body: 'not json' }), gh)).status, 401);
  const cross = await run(call('POST', { password: INITIAL.sean }, { headers: { ...same, origin: 'https://evil.example' } }), gh);
  assert.equal(cross.status, 403);
  assert.equal(cross.headers.get('set-cookie'), null);
  const plain = await run(call('POST', { password: INITIAL.sean }, { headers: { ...same, 'content-type': 'text/plain' } }), gh);
  assert.equal(plain.status, 400);
});

test('choosing your own password: needs the current password, stores only a hash, signs out the old cookie', async () => {
  const gh = fakeGitHub();
  const login = await run(call('POST', { password: INITIAL.sean }), gh);
  const old = cookieOf(login);

  const wrong = await run(call('PUT', { current: 'not-my-password', next: 'my-brand-new-password' }, { cookie: old }), gh);
  assert.equal(wrong.status, 401);
  assert.equal(AUTH_VAR in gh.store.vars, false, 'nothing written');
  assert.equal((await run(call('PUT', { current: INITIAL.sean, next: 'my-brand-new-password' }), gh)).status, 401, 'no cookie');
  assert.equal((await (await run(call('PUT', { current: INITIAL.sean, next: 'short' }, { cookie: old }), gh)).json()).error, 'too-short');
  assert.equal((await (await run(call('PUT', { current: INITIAL.sean, next: INITIAL.blue }, { cookie: old }), gh)).json()).error, 'taken');
  assert.equal((await (await run(call('PUT', { current: INITIAL.sean, next: INITIAL.sean }, { cookie: old }), gh)).json()).error, 'same-as-current');
  assert.equal((await run(call('PUT', { current: INITIAL.sean, next: 'my-brand-new-password' }, { cookie: old, headers: { ...same, origin: 'https://evil.example' } }), gh)).status, 403);

  const ok = await run(call('PUT', { current: INITIAL.sean, next: 'my-brand-new-password' }, { cookie: old }), gh);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { user: { name: 'sean', mustChange: false } });
  const stored = JSON.parse(gh.store.vars[AUTH_VAR]);
  assert.match(stored.sean.hash, /^scrypt\$/);
  assert.ok(!gh.store.vars[AUTH_VAR].includes('my-brand-new-password'), 'the password itself is never stored');
  assert.equal(stored.blue, undefined);

  const gone = await run(call('GET', null, { cookie: old }), gh);
  assert.equal((await gone.json()).user, null, 'the old cookie no longer works');
  const fresh = await run(call('GET', null, { cookie: cookieOf(ok) }), gh);
  assert.deepEqual((await fresh.json()).user, { name: 'sean', mustChange: false });

  // From now on only the new password works; the initial one is dead, Blue is untouched.
  assert.equal((await run(call('POST', { password: INITIAL.sean }), gh)).status, 401);
  assert.equal((await (await run(call('POST', { password: 'my-brand-new-password' }), gh)).json()).user.name, 'sean');
  assert.deepEqual((await (await run(call('POST', { password: INITIAL.blue }), gh)).json()).user, { name: 'blue', mustChange: true });
});

test('two people changing passwords never overwrite each other', async () => {
  const gh = fakeGitHub();
  for (const [name, next] of [['sean', 'sean-chosen-password-1'], ['blue', 'blue-chosen-password-2']]) {
    const login = await run(call('POST', { password: INITIAL[name] }), gh);
    assert.equal((await run(call('PUT', { current: INITIAL[name], next }, { cookie: cookieOf(login) }), gh)).status, 200);
  }
  assert.deepEqual(Object.keys(JSON.parse(gh.store.vars[AUTH_VAR])).sort(), ['blue', 'sean']);
  // Blue can no longer pick Sean's password, even though it is only stored as a hash.
  const login = await run(call('POST', { password: 'blue-chosen-password-2' }), gh);
  const res = await run(call('PUT', { current: 'blue-chosen-password-2', next: 'sean-chosen-password-1' }, { cookie: cookieOf(login) }), gh);
  assert.equal((await res.json()).error, 'taken');
});

test('fails closed when GitHub cannot be reached: nobody gets in on a password that may have been changed', async () => {
  const gh = fakeGitHub();
  gh.store.down = true;
  const login = await run(call('POST', { password: INITIAL.sean }), gh);
  assert.equal(login.status, 503);
  assert.equal(login.headers.get('set-cookie'), null);
  const status = await (await run(call('GET'), gh)).json();
  assert.equal(status.configured, false);
  assert.ok(status.problems.some((p) => /GitHub variables unreachable/.test(p)));
});

test('GET /api/auth is public and explains a broken setup; DELETE signs out only from our own origin', async () => {
  const gh = fakeGitHub();
  assert.deepEqual(await (await run(call('GET'), gh)).json(), { configured: true, user: null, problems: [] });
  const off = await (await run(call('GET'), gh, { env: {} })).json();
  assert.deepEqual(off, { configured: false, user: null, problems: ['PASSWORD_SEAN', 'PASSWORD_BLUE', 'SESSION_SECRET', 'TRACKERS_GITHUB_TOKEN'] });
  assert.equal((await run(call('POST', { password: 'anything' }), gh, { env: {} })).status, 501);
  assert.equal((await run(call('DELETE', null, { headers: { origin: 'https://evil.example', host: 'app.example' } }), gh)).status, 403);
  const out = await run(call('DELETE'), gh);
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await run(call('PATCH', {}), gh)).status, 405);
});
