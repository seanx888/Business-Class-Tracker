// Vercel Function: password sign-in for USERA & USERB (env vars and storage: see _lib/auth.mjs).
//
//   GET    /api/auth   → { configured, user, problems }
//                        user = { name, mustChange } when signed in; `problems` names the env vars that are missing /
//                        unusable, or says GitHub cannot be reached (never any values)
//   POST   /api/auth   { password } → { user } + session cookie         (401 when it matches nobody)
//   PUT    /api/auth   { current, next } → { user } + new session cookie (change your own password)
//   DELETE /api/auth   → sign out (clears the cookie)
import {
  authConfigured, syncConfigured, syncProblems, authStore, currentUser, whoIs, matches, passwordProblem, hashPassword,
  signSession, sessionCookie, clearCookie, sameOrigin,
} from './_lib/auth.mjs';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isJson = (request) => /^application\/json\b/i.test(request.headers.get('content-type') || '');
const text = (v) => (typeof v === 'string' ? v.slice(0, 300) : '');

export async function handle(request, { env = process.env, fetchImpl = fetch, now = Date.now(), delayMs = 700 } = {}) {
  const store = authStore(env, fetchImpl);

  if (request.method === 'GET') {
    const problems = syncProblems(env);
    let user = null;
    if (authConfigured(env) && env.TRACKERS_GITHUB_TOKEN) {
      try {
        user = currentUser(request, env, await store.load(), now);
      } catch {
        problems.push('GitHub variables unreachable (check TRACKERS_GITHUB_TOKEN and TRACKERS_REPO)');
      }
    }
    return json({ configured: syncConfigured(env) && !problems.some((p) => p.startsWith('GitHub')), user, problems });
  }

  if (!syncConfigured(env)) return json({ error: 'auth-not-configured' }, 501);
  if (!['POST', 'PUT', 'DELETE'].includes(request.method)) return json({ error: 'method-not-allowed' }, 405);
  if (!sameOrigin(request)) return json({ error: 'bad-origin' }, 403); // cookies ride along automatically — only our own page may call
  if (request.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
  if (!isJson(request)) return json({ error: 'bad-request' }, 400);
  const body = (await request.json().catch(() => null)) || {};

  let own;
  try {
    own = await store.load();
  } catch {
    return json({ error: 'auth-store-unavailable' }, 503); // fail closed: never fall back to a password that was changed
  }

  if (request.method === 'POST') {
    const name = await whoIs(text(body.password), env, own);
    if (!name) {
      await sleep(delayMs); // slow down guessing
      return json({ error: 'wrong-password' }, 401);
    }
    return json({ user: { name, mustChange: !own[name]?.hash } }, 200, { 'Set-Cookie': sessionCookie(signSession(name, env, own, { now })) });
  }

  // PUT — choose a new password (needs the current sign-in AND the current password, so a stolen cookie is not enough)
  const user = currentUser(request, env, own, now);
  if (!user) return json({ error: 'sign-in-required' }, 401);
  const current = text(body.current);
  if (!(await matches(user.name, current, env, own))) {
    await sleep(delayMs);
    return json({ error: 'wrong-password' }, 401);
  }
  const next = text(body.next);
  const problem = await passwordProblem(next, { name: user.name, current, env, own });
  if (problem) return json({ error: problem }, 400);
  try {
    const updated = await store.setHash(user.name, await hashPassword(next), new Date(now).toISOString());
    return json({ user: { name: user.name, mustChange: false } }, 200, { 'Set-Cookie': sessionCookie(signSession(user.name, env, updated, { now })) });
  } catch {
    return json({ error: 'auth-store-unavailable' }, 503);
  }
}

export default {
  fetch(request) {
    return handle(request);
  },
};
