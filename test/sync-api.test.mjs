import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, sanitize } from '../web/api/trackers.mjs';
import { signSession, COOKIE } from '../web/api/_lib/auth.mjs';

const NOW = Date.parse('2026-09-30T00:00:00Z');
const env = {
  GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', ALLOWED_EMAILS: 'sean@gmail.com,blue@gmail.com', SESSION_SECRET: 's'.repeat(40),
  TRACKERS_GITHUB_TOKEN: 'ghp_test', TRACKERS_REPO: 'me/repo',
};
const session = (email = 'sean@gmail.com') => `${COOKIE}=${signSession({ email }, env.SESSION_SECRET, { now: NOW })}`;
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
const run = (request, extra = {}) => handle(request, { env, now: NOW, ...extra });

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

test('ping is public and reports whether sign-in AND the GitHub token are set up', async () => {
  assert.deepEqual(await (await run(req('GET', { cookie: null, query: '?ping=1' }))).json(), { configured: true });
  assert.deepEqual(await (await run(req('GET', { cookie: null, query: '?ping=1' }), { env: { ...env, TRACKERS_GITHUB_TOKEN: '' } })).json(), { configured: false });
  assert.deepEqual(await (await run(req('GET', { cookie: null, query: '?ping=1' }), { env: { ...env, SESSION_SECRET: 'short' } })).json(), { configured: false });
  assert.equal((await run(req('GET'), { env: {} })).status, 501);
});

test('signed-out visitors, strangers and tampered cookies are refused and GitHub is never called', async () => {
  const { store, fetchImpl } = fakeGitHub('[]');
  assert.equal((await run(req('GET', { cookie: null }), { fetchImpl })).status, 401);
  assert.equal((await run(req('GET', { cookie: session('stranger@gmail.com') }), { fetchImpl })).status, 401, 'valid cookie but not on the allow-list');
  assert.equal((await run(req('GET', { cookie: `${COOKIE}=abc.def` }), { fetchImpl })).status, 401);
  assert.equal((await run(req('GET'), { fetchImpl, env: { ...env, ALLOWED_EMAILS: 'blue@gmail.com' } })).status, 401, 'removed from ALLOWED_EMAILS');
  assert.equal(store.calls.length, 0);
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
  assert.equal(store.calls.length, 0);
});

test('PUT creates the variable, GET reads it back; unknown fields are dropped', async () => {
  const { store, fetchImpl } = fakeGitHub(null);
  const trackers = [{ id: 'tabc1', o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2027-01-05', flex: 2, notify: ['sean'], evil: '<script>', label: 'x'.repeat(200) }];
  const put = await run(req('PUT', { body: { trackers } }), { fetchImpl });
  assert.equal(put.status, 200);
  const saved = JSON.parse(store.value);
  assert.equal(saved[0].evil, undefined);
  assert.equal(saved[0].label.length, 60);
  assert.deepEqual(store.calls.map((c) => c.method), ['PATCH', 'POST']);
  assert.match(store.calls[1].url, /repos\/me\/repo\/actions\/variables$/);
  assert.equal(store.calls[0].auth, 'Bearer ghp_test');
  const got = await (await run(req('GET', { cookie: session('blue@gmail.com') }), { fetchImpl })).json();
  assert.equal(got.trackers[0].d, 'CDG');
});

test('bad bodies are rejected; GitHub errors surface as 502', async () => {
  const { fetchImpl } = fakeGitHub('[]');
  assert.equal((await run(req('PUT', { body: { trackers: 'nope' } }), { fetchImpl })).status, 400);
  assert.equal((await run(req('PUT', { body: { trackers: [{ o: 'TPE' }] } }), { fetchImpl })).status, 400);
  assert.equal((await run(req('DELETE'), { fetchImpl })).status, 405);
  const down = async () => new Response('bad credentials', { status: 401 });
  const res = await run(req('GET'), { fetchImpl: down });
  assert.equal(res.status, 502);
  assert.throws(() => sanitize(new Array(51).fill({ o: 'TPE', d: 'NRT', depart: '2026-11-01' })), /at most 50/);
});
