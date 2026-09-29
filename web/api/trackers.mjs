// Vercel Function: syncs Real Tracker trips between the app and the daily scanner.
// Trips are stored in the private GitHub repository variable TRACKERS, which the scan workflow reads —
// so nothing personal lands in the public repo and no database is needed.
//
// Vercel → Project → Settings → Environment Variables:
//   PASSWORD_USERA, PASSWORD_USERB, SESSION_SECRET   password sign-in for USERA & USERB (see api/_lib/auth.mjs)
//   TRACKERS_GITHUB_TOKEN   fine-grained GitHub token, this repo only, permission "Variables: Read and write"
//   TRACKERS_REPO           optional, default seanx888/aethersky
//
//   GET  /api/trackers?ping=1   → { configured }                         (public)
//   GET  /api/trackers          → { trackers }                           (signed-in session cookie)
//   PUT  /api/trackers          { trackers: [...] } → { trackers, saved }  (session cookie, same origin, JSON)
// The scanner re-validates every trip (web/core/trackers.js); this layer only bounds shape and size.
import { authStore, currentUser, sameOrigin, syncConfigured } from './_lib/auth.mjs';
import { variables } from './_lib/github.mjs';

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

/** The TRACKERS variable as a list. */
function trackerStore(env, fetchImpl) {
  const gh = variables(env, fetchImpl);
  return {
    async read() {
      const raw = await gh.read(VAR); // GitHub errors must surface (→ 502), only junk JSON is treated as "no trackers"
      try {
        const v = JSON.parse(raw || '[]');
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    },
    write: (list) => gh.write(VAR, JSON.stringify(list)),
  };
}

export async function handle(request, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const url = new URL(request.url);
  const configured = syncConfigured(env);
  if (request.method === 'GET' && url.searchParams.has('ping')) return json({ configured });
  if (!configured) return json({ error: 'sync-not-configured' }, 501);
  if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'method-not-allowed' }, 405);
  try {
    const user = currentUser(request, env, await authStore(env, fetchImpl).load(), now);
    if (!user) return json({ error: 'sign-in-required' }, 401);
    if (user.mustChange) return json({ error: 'password-change-required' }, 403); // still on the initial password
  } catch {
    return json({ error: 'auth-store-unavailable' }, 503); // fail closed: never fall back to a password that was changed
  }
  if (request.method === 'PUT' && (!sameOrigin(request) || !/^application\/json\b/i.test(request.headers.get('content-type') || ''))) {
    return json({ error: 'bad-origin' }, 403); // the cookie is sent automatically — only our own page may write
  }
  const gh = trackerStore(env, fetchImpl);
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
