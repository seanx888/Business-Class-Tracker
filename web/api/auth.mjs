// Vercel Function: Google sign-in for Sean & Blue (see _lib/auth.mjs for the env vars).
//
//   GET    /api/auth   → { configured, clientId, user }        the page asks who is signed in
//   POST   /api/auth   form post from Google (ux_mode=redirect): credential + g_csrf_token
//                      → 303 to the app with a session cookie, or to /?signin=denied|error
//   DELETE /api/auth   → sign out (clears the cookie)
import {
  authConfigured, syncConfigured, allowedEmails, currentUser, verifyGoogleIdToken, signSession,
  sessionCookie, clearCookie, cookieValue, sameOrigin, safeEqual,
} from './_lib/auth.mjs';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const back = (query, headers = {}) => new Response(null, { status: 303, headers: { Location: `/${query}#/settings`, 'Cache-Control': 'no-store', ...headers } });

export async function handle(request, { env = process.env, fetchImpl = fetch, now = Date.now(), delayMs = 700 } = {}) {
  const ready = authConfigured(env);

  if (request.method === 'GET') {
    const user = currentUser(request, env, now);
    return json({ configured: syncConfigured(env), clientId: ready ? env.GOOGLE_CLIENT_ID : null, user: user && { email: user.email, name: user.name } });
  }
  if (!ready) return json({ error: 'auth-not-configured' }, 501);

  if (request.method === 'DELETE') {
    if (!sameOrigin(request)) return json({ error: 'bad-origin' }, 403);
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
  }

  if (request.method === 'POST') {
    // Google posts from accounts.google.com, so Origin is not ours; the double-submit g_csrf_token protects instead.
    const form = new URLSearchParams(await request.text().catch(() => ''));
    const csrf = form.get('g_csrf_token');
    if (!csrf || !safeEqual(csrf, cookieValue(request, 'g_csrf_token') || '')) {
      await sleep(delayMs);
      return back('?signin=error');
    }
    try {
      const user = await verifyGoogleIdToken(form.get('credential'), { clientId: env.GOOGLE_CLIENT_ID, fetchImpl, now });
      if (!allowedEmails(env).has(user.email)) {
        await sleep(delayMs); // slow down guessing; never say which addresses are allowed
        return back('?signin=denied');
      }
      return back('', { 'Set-Cookie': sessionCookie(signSession(user, env.SESSION_SECRET, { now })) });
    } catch (e) {
      await sleep(delayMs);
      return back(e.code === 'certs-unavailable' ? '?signin=error' : '?signin=denied');
    }
  }
  return json({ error: 'method-not-allowed' }, 405);
}

export default {
  fetch(request) {
    return handle(request);
  },
};
