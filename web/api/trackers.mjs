// Vercel Function: syncs Real Tracker trips between the app and the daily scanner.
// Trips are stored in the private GitHub repository variable TRACKERS, which the scan workflow reads —
// so nothing personal lands in the public repo and no database is needed.
//
// Vercel → Project → Settings → Environment Variables:
//   APP_PASSCODE            shared passcode typed once in the app (≥ 8 characters)
//   TRACKERS_GITHUB_TOKEN   fine-grained GitHub token, this repo only, permission "Variables: Read and write"
//   TRACKERS_REPO           optional, default seanx888/aethersky
//
//   GET  /api/trackers?ping=1   → { configured }                         (no passcode)
//   GET  /api/trackers          → { trackers }                           (Authorization: Bearer <passcode>)
//   PUT  /api/trackers          { trackers: [...] } → { trackers, saved }
// The scanner re-validates every trip (web/core/trackers.js); this layer only bounds shape and size.
import { createHash, timingSafeEqual } from 'node:crypto';

const VAR = 'TRACKERS';
const MAX_TRACKERS = 50;
const MAX_BYTES = 40000; // GitHub variables hold up to 48 KB
const FIELDS = {
  id: 'string', o: 'string', d: 'string', trip: 'string', mode: 'string', depart: 'string', return: 'string',
  flex: 'number', cabin: 'string', maxStops: 'number', target: 'number', alertOn: 'string', notify: 'notify',
  label: 'string', paused: 'boolean', created: 'string',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digest = (s) => createHash('sha256').update(String(s)).digest();

function authorized(request, passcode) {
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return !!got && timingSafeEqual(digest(got), digest(passcode));
}

/** Keep known fields with the right types and sane lengths; drop everything else. */
export function sanitize(list) {
  if (!Array.isArray(list)) throw new Error('trackers must be an array');
  if (list.length > MAX_TRACKERS) throw new Error(`at most ${MAX_TRACKERS} trackers`);
  return list.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('each tracker must be an object');
    const t = {};
    for (const [k, type] of Object.entries(FIELDS)) {
      const v = raw[k];
      if (v == null) continue;
      if (type === 'notify') {
        if (v === 'all') t[k] = 'all';
        else if (Array.isArray(v)) t[k] = v.filter((n) => typeof n === 'string').map((n) => n.slice(0, 32)).slice(0, 10);
      } else if (typeof v === type) {
        t[k] = type === 'string' ? v.slice(0, k === 'label' ? 60 : 40) : v;
      }
    }
    if (!t.o || !t.d || !t.depart) throw new Error('each tracker needs o, d and depart');
    return t;
  });
}

function github(env, fetchImpl) {
  const repo = env.TRACKERS_REPO || 'seanx888/aethersky';
  const base = `https://api.github.com/repos/${repo}/actions/variables`;
  const headers = {
    Authorization: `Bearer ${env.TRACKERS_GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'aethersky-tracker-sync',
  };
  const fail = async (res, what) => {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    throw Object.assign(new Error(`GitHub ${what} HTTP ${res.status} ${detail}`), { status: res.status });
  };
  return {
    async read() {
      const res = await fetchImpl(`${base}/${VAR}`, { headers });
      if (res.status === 404) return [];
      if (!res.ok) await fail(res, 'read');
      const { value } = await res.json();
      try {
        const v = JSON.parse(value || '[]');
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    },
    async write(list) {
      const value = JSON.stringify(list);
      const body = (extra) => JSON.stringify({ name: VAR, value, ...extra });
      let res = await fetchImpl(`${base}/${VAR}`, { method: 'PATCH', headers, body: body() });
      if (res.status === 404) res = await fetchImpl(base, { method: 'POST', headers, body: body() });
      if (!res.ok) await fail(res, 'write');
    },
  };
}

export async function handle(request, { env = process.env, fetchImpl = fetch } = {}) {
  const url = new URL(request.url);
  const configured = !!(env.APP_PASSCODE && env.APP_PASSCODE.length >= 8 && env.TRACKERS_GITHUB_TOKEN);
  if (request.method === 'GET' && url.searchParams.has('ping')) return json({ configured });
  if (!configured) return json({ error: 'sync-not-configured' }, 501);
  if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'method-not-allowed' }, 405);
  if (!authorized(request, env.APP_PASSCODE)) {
    await sleep(700); // slow down guessing
    return json({ error: 'wrong-passcode' }, 401);
  }
  const gh = github(env, fetchImpl);
  try {
    if (request.method === 'GET') return json({ trackers: await gh.read() });
    const text = await request.text();
    if (text.length > MAX_BYTES * 2) return json({ error: 'too-large' }, 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'bad-json' }, 400);
    }
    const trackers = sanitize(body?.trackers);
    if (JSON.stringify(trackers).length > MAX_BYTES) return json({ error: 'too-large' }, 413);
    await gh.write(trackers);
    return json({ trackers, saved: true });
  } catch (e) {
    if (e.status) return json({ error: 'github', status: e.status }, 502);
    return json({ error: 'invalid', detail: e.message }, 400);
  }
}

export default {
  fetch(request) {
    return handle(request);
  },
};
