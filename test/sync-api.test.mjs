import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, sanitize } from '../web/api/trackers.mjs';

const env = { APP_PASSCODE: 'correct-horse-9', TRACKERS_GITHUB_TOKEN: 'ghp_test', TRACKERS_REPO: 'me/repo' };
const req = (method, { auth = env.APP_PASSCODE, body, query = '' } = {}) =>
  new Request(`https://app.example/api/trackers${query}`, {
    method,
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

function fakeGitHub(initial) {
  const store = { value: initial, calls: [] };
  const fetchImpl = async (url, init = {}) => {
    store.calls.push({ url, method: init.method || 'GET', auth: init.headers?.Authorization });
    if (!init.method || init.method === 'GET') {
      return store.value == null ? new Response('{}', { status: 404 }) : Response.json({ name: 'TRACKERS', value: store.value });
    }
    if (init.method === 'PATCH' && store.value == null) return new Response('{}', { status: 404 });
    store.value = JSON.parse(init.body).value;
    return new Response(null, { status: init.method === 'POST' ? 201 : 204 });
  };
  return { store, fetchImpl };
}

test('ping works without a passcode and reports whether sync is set up', async () => {
  assert.deepEqual(await (await handle(req('GET', { auth: null, query: '?ping=1' }), { env })).json(), { configured: true });
  assert.deepEqual(await (await handle(req('GET', { auth: null, query: '?ping=1' }), { env: { APP_PASSCODE: 'short' } })).json(), { configured: false });
  assert.equal((await handle(req('GET'), { env: {} })).status, 501);
});

test('wrong passcode is refused and GitHub is never called', async () => {
  const { store, fetchImpl } = fakeGitHub('[]');
  const res = await handle(req('GET', { auth: 'nope' }), { env, fetchImpl });
  assert.equal(res.status, 401);
  assert.equal(store.calls.length, 0);
});

test('PUT creates the variable, GET reads it back; unknown fields are dropped', async () => {
  const { store, fetchImpl } = fakeGitHub(null);
  const trackers = [{ id: 'tabc1', o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2027-01-05', flex: 2, notify: ['sean'], evil: '<script>', label: 'x'.repeat(200) }];
  const put = await handle(req('PUT', { body: { trackers } }), { env, fetchImpl });
  assert.equal(put.status, 200);
  const saved = JSON.parse(store.value);
  assert.equal(saved[0].evil, undefined);
  assert.equal(saved[0].label.length, 60);
  assert.deepEqual(store.calls.map((c) => c.method), ['PATCH', 'POST']);
  assert.match(store.calls[1].url, /repos\/me\/repo\/actions\/variables$/);
  assert.equal(store.calls[0].auth, 'Bearer ghp_test');
  const got = await (await handle(req('GET'), { env, fetchImpl })).json();
  assert.equal(got.trackers[0].d, 'CDG');
});

test('bad bodies are rejected; GitHub errors surface as 502', async () => {
  const { fetchImpl } = fakeGitHub('[]');
  assert.equal((await handle(req('PUT', { body: { trackers: 'nope' } }), { env, fetchImpl })).status, 400);
  assert.equal((await handle(req('PUT', { body: { trackers: [{ o: 'TPE' }] } }), { env, fetchImpl })).status, 400);
  assert.equal((await handle(req('DELETE'), { env, fetchImpl })).status, 405);
  const down = async () => new Response('bad credentials', { status: 401 });
  const res = await handle(req('GET'), { env, fetchImpl: down });
  assert.equal(res.status, 502);
  assert.throws(() => sanitize(new Array(51).fill({ o: 'TPE', d: 'NRT', depart: '2026-11-01' })), /at most 50/);
});
