import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, sanitize } from '../web/api/trackers.mjs';
import { signSession, hashPassword, COOKIE, AUTH_VAR } from '../web/api/_lib/auth.mjs';
import { fakeGitHub as baseGitHub } from './helpers/github.mjs';

const NOW = Date.parse('2026-09-30T00:00:00Z');
const env = {
  PASSWORD_SEAN: 'sean-initial-pass-1', PASSWORD_BLUE: 'blue-initial-pass-2', SESSION_SECRET: 's'.repeat(40),
  TRACKERS_GITHUB_TOKEN: 'ghp_test', TRACKERS_REPO: 'me/repo',
};
// Both people have already chosen their own password (otherwise sync is locked, see the last test).
const own = { sean: { hash: await hashPassword('sean-own-password-9'), at: '' }, blue: { hash: await hashPassword('blue-own-password-8'), at: '' } };
const session = (name = 'sean', o = own, e = env) => `${COOKIE}=${signSession(name, e, o, { now: NOW })}`;
// Same-origin browser request by default; pass `cookie: null` for a signed-out visitor.
const req = (method, { cookie = session(), body, query = '', headers = {} } = {}) =>
  new Request(`https://app.example/api/trackers${query}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json', origin: 'https://app.example', host: 'app.example' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const fakeGitHub = (trackers = '[]', vars = {}) => baseGitHub({ ...(trackers == null ? {} : { TRACKERS: trackers }), [AUTH_VAR]: JSON.stringify(own), ...vars });
const run = (request, { fetchImpl, ...extra } = {}) => handle(request, { env, now: NOW, fetchImpl: fetchImpl || fakeGitHub().fetchImpl, ...extra });
const trackerCalls = (store) => store.calls.filter((c) => c.name === 'TRACKERS');

test('ping is public and reports whether sign-in AND the GitHub token are set up', async () => {
  assert.deepEqual(await (await run(req('GET', { cookie: null, query: '?ping=1' }))).json(), { configured: true });
  assert.deepEqual(await (await run(req('GET', { cookie: null, query: '?ping=1' }), { env: { ...env, TRACKERS_GITHUB_TOKEN: '' } })).json(), { configured: false });
  assert.deepEqual(await (await run(req('GET', { cookie: null, query: '?ping=1' }), { env: { ...env, SESSION_SECRET: 'short' } })).json(), { configured: false });
  assert.deepEqual(await (await run(req('GET', { cookie: null, query: '?ping=1' }), { env: { ...env, PASSWORD_SEAN: '', PASSWORD_BLUE: 'short' } })).json(), { configured: false });
  assert.equal((await run(req('GET'), { env: {} })).status, 501);
});

test('signed-out visitors, strangers and tampered cookies are refused and GitHub is never called', async () => {
  const { store, fetchImpl } = fakeGitHub('[]');
  assert.equal((await run(req('GET', { cookie: null }), { fetchImpl })).status, 401);
  assert.equal((await run(req('GET', { cookie: `${COOKIE}=abc.def` }), { fetchImpl })).status, 401);
  assert.equal((await run(req('GET'), { fetchImpl, env: { ...env, PASSWORD_SEAN: undefined } })).status, 401, 'Sean\'s password removed → his cookie stops working');
  const changed = fakeGitHub('[]', { [AUTH_VAR]: JSON.stringify({ ...own, sean: { hash: await hashPassword('another-new-password'), at: '' } }) });
  assert.equal((await run(req('GET'), { fetchImpl: changed.fetchImpl })).status, 401, 'password changed → signed out everywhere');
  assert.equal(trackerCalls(store).length, 0, 'the tracker list is never touched');
});

test('writes must come from our own page (cookies are sent automatically, so CSRF is checked)', async () => {
  const { store, fetchImpl } = fakeGitHub('[]');
  const trackers = [{ o: 'TPE', d: 'NRT', depart: '2026-11-01' }];
  const cross = req('PUT', { body: { trackers }, headers: { origin: 'https://evil.example' } });
  assert.equal((await run(cross, { fetchImpl })).status, 403);
  const form = new Request('https://app.example/api/trackers', {
    method: 'PUT', headers: { cookie: session(), origin: 'https://app.example', host: 'app.example', 'content-type': 'text/plain' }, body: JSON.stringify({ trackers }),
  });
  assert.equal((await run(form, { fetchImpl })).status, 403, 'JSON content-type required');
  assert.equal(trackerCalls(store).length, 0);
});

test('PUT creates the variable, GET reads it back; unknown fields are dropped', async () => {
  const { store, fetchImpl } = fakeGitHub(null);
  const trackers = [{ id: 'tabc1', o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2027-01-05', flex: 2, notify: ['sean'], evil: '<script>', label: 'x'.repeat(200) }];
  const put = await run(req('PUT', { body: { trackers } }), { fetchImpl });
  assert.equal(put.status, 200);
  const saved = JSON.parse(store.vars.TRACKERS);
  assert.equal(saved[0].evil, undefined);
  assert.equal(saved[0].label.length, 60);
  const writes = store.calls.filter((c) => c.method !== 'GET');
  assert.deepEqual(writes.map((c) => c.method), ['PATCH', 'POST']);
  assert.match(writes[1].url, /repos\/me\/repo\/actions\/variables$/);
  assert.equal(writes[0].auth, 'Bearer ghp_test');
  const got = await (await run(req('GET', { cookie: session('blue') }), { fetchImpl })).json();
  assert.equal(got.trackers[0].d, 'CDG');
});

test('bad bodies are rejected; GitHub errors surface as 502', async () => {
  const { fetchImpl } = fakeGitHub('[]');
  assert.equal((await run(req('PUT', { body: { trackers: 'nope' } }), { fetchImpl })).status, 400);
  assert.equal((await run(req('PUT', { body: { trackers: [{ o: 'TPE' }] } }), { fetchImpl })).status, 400);
  assert.equal((await run(req('DELETE'), { fetchImpl })).status, 405);
  // GitHub answers for AUTH (so sign-in works) but refuses the TRACKERS variable.
  const partial = async (url, init) => (url.endsWith('/TRACKERS') ? new Response('bad credentials', { status: 401 }) : fetchImpl(url, init));
  assert.equal((await run(req('GET'), { fetchImpl: partial })).status, 502);
  assert.throws(() => sanitize(new Array(51).fill({ o: 'TPE', d: 'NRT', depart: '2026-11-01' })), /at most 50/);
});

test('sync stays locked until the person has replaced the initial password', async () => {
  const { store, fetchImpl } = baseGitHub({ TRACKERS: '[]' }); // nobody has chosen a password yet
  const cookie = `${COOKIE}=${signSession('sean', env, {}, { now: NOW })}`;
  const res = await run(req('GET', { cookie }), { fetchImpl });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'password-change-required');
  assert.equal((await run(req('PUT', { cookie, body: { trackers: [] } }), { fetchImpl })).status, 403);
  assert.equal(trackerCalls(store).length, 0);
});

test('when GitHub cannot be reached, sync fails closed instead of trusting an old password', async () => {
  const { store, fetchImpl } = fakeGitHub('[]');
  store.down = true;
  assert.equal((await run(req('GET'), { fetchImpl })).status, 503);
});
