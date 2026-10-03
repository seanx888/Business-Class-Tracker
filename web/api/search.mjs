// Vercel Function: live flight search — the in-app "search now" (Google Flights through SerpApi).
//
// Behind the same sign-in as tracker sync (auth.mjs): every search spends SerpApi quota, the public pages never do.
//
// Vercel → Project → Settings → Environment Variables (in addition to the sign-in ones, see api/_lib/auth.mjs):
//   SERPAPI_KEY, SERPAPI_KEY_2   the same SerpApi key(s) the daily scan uses (the 2nd one is used when the 1st runs dry)
//   SEARCH_RESERVE               optional, default 60 — searches always left for the daily scan; live search refuses to dip below
//
//   GET  /api/search?ping=1      → { configured }                                         (public)
//   POST /api/search  { op: 'search',   search, verify? }                  → { deals, excluded, insights, searches, quota }
//                     { op: 'complete', search, token, firstLeg, price }   → { ok, legs, price, priceTWD }   (rest of a multi-leg option)
//                     { op: 'pos',      search, market, legs, carrier, priceTWD } → { market: {…}|null }       (same trip, another country)
// A request runs at most a handful of SerpApi calls so it fits the function's time limit; the page chains requests itself.
import { authStore, currentUser, sameOrigin, syncConfigured } from './_lib/auth.mjs';
import { searchSerpApi, serpApiAccount, walkLegs, isQuotaError } from './_lib/serpapi.mjs';
import { fetchFx, toTWD } from './_lib/fx.mjs';
import { buildDeals, loadCountries } from './_lib/deals.mjs';
import { matchOffer, posResult } from './_lib/pos.mjs';
import { checkItinerary } from '../core/exclusion.js';
import { normalizeSearch, routeSegments } from '../core/search.js';
import { marketFor } from '../core/markets.js';

const MAX_BODY = 30000;
const MAX_VERIFY = 2;
const MAX_DEALS = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 30; // requests per person per window, per server instance — a guard against a runaway page, not a billing system
const FX_TTL_MS = 6 * 3600 * 1000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export const serpKeys = (env) => [env.SERPAPI_KEY, env.SERPAPI_KEY_2].map((k) => String(k || '').trim()).filter(Boolean);
export const searchConfigured = (env) => syncConfigured(env) && serpKeys(env).length > 0;

const rate = new Map();
function limited(name, now) {
  const hits = (rate.get(name) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  rate.set(name, hits);
  return hits.length > RATE_MAX;
}

let fxCache = null;
async function rates(fetchImpl, now) {
  if (fxCache && now - fxCache.at < FX_TTL_MS && fxCache.fetchImpl === fetchImpl) return fxCache.fx;
  const fx = await fetchFx(fetchImpl);
  fxCache = { at: now, fx, fetchImpl };
  return fx;
}

/** First key with at least `cost + reserve` searches left. If the free Account API cannot be reached, the first key is used. */
async function pickKey(env, fetchImpl, cost) {
  const reserve = Number(env.SEARCH_RESERVE ?? 60);
  let best = null;
  for (const key of serpKeys(env)) {
    try {
      const a = await serpApiAccount(key, fetchImpl);
      if (!best || a.left > best.left) best = { key, left: a.left };
      if (a.left - cost >= reserve) return { key, left: a.left, reserve };
    } catch {
      return { key, left: null, reserve };
    }
  }
  return { error: 'quota-reserve', left: best?.left ?? 0, reserve };
}

const redactor = (env) => (msg) => serpKeys(env).reduce((m, k) => m.split(k).join('***'), String(msg));

const todayTpe = (now) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);

export async function handle(request, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const url = new URL(request.url);
  const configured = searchConfigured(env);
  if (request.method === 'GET' && url.searchParams.has('ping')) return json({ configured });
  if (!configured) return json({ error: 'search-not-configured' }, 501);
  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  let user;
  try {
    user = currentUser(request, env, await authStore(env, fetchImpl).load(), now);
  } catch {
    return json({ error: 'auth-store-unavailable' }, 503); // fail closed, same as tracker sync
  }
  if (!user) return json({ error: 'sign-in-required' }, 401);
  if (user.mustChange) return json({ error: 'password-change-required' }, 403);
  if (!sameOrigin(request) || !/^application\/json\b/i.test(request.headers.get('content-type') || '')) return json({ error: 'bad-origin' }, 403);
  if (limited(user.name, now)) return json({ error: 'rate-limited' }, 429);

  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'too-large' }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad-json' }, 400);
  }
  const { search, error } = normalizeSearch(body?.search);
  if (error) return json({ error: 'invalid', detail: error }, 400);

  const redact = redactor(env);
  const legCount = routeSegments(search).length;
  const op = body.op;
  const countries = loadCountries();
  const filter = (itin) => checkItinerary(itin, { countries }).ok;

  try {
    if (op === 'search') {
      const verify = Math.max(0, Math.min(MAX_VERIFY, Number(body.verify) || 0));
      const cost = 1 + (legCount > 1 ? verify * (legCount - 1) : 0);
      if (cost > 5) return json({ error: 'too-expensive', cost }, 400);
      const key = await pickKey(env, fetchImpl, cost);
      if (key.error) return json({ error: key.error, left: key.left, reserve: key.reserve }, 429);
      const fx = await rates(fetchImpl, now);
      const res = await searchSerpApi({ search }, { apiKey: key.key, currency: 'TWD', gl: 'tw', sortBy: 'price', verifyReturn: verify, filter, fetchImpl });
      const { deals, excluded } = buildDeals(res.offers, { search, fx, insights: res.insights, countries, today: todayTpe(now) });
      return json({
        deals: deals.slice(0, MAX_DEALS),
        found: res.offers.length,
        excluded,
        insights: res.insights,
        searches: res.searches,
        quota: key.left == null ? null : { left: Math.max(0, key.left - res.searches), reserve: key.reserve },
        generatedAt: new Date(now).toISOString(),
      });
    }

    if (op === 'complete') {
      if (legCount < 2) return json({ error: 'invalid', detail: 'single-leg' }, 400);
      if (typeof body.token !== 'string' || !body.token || body.token.length > 4000 || !body.firstLeg?.segments) return json({ error: 'invalid', detail: 'token' }, 400);
      const key = await pickKey(env, fetchImpl, legCount - 1);
      if (key.error) return json({ error: key.error, left: key.left, reserve: key.reserve }, 429);
      const fx = await rates(fetchImpl, now);
      const option = { legs: [body.firstLeg], departureToken: body.token, price: Number(body.price) || 0 };
      const walked = await walkLegs({ search }, option, { apiKey: key.key, currency: 'TWD', gl: 'tw', sortBy: 'price', filter }, fetchImpl, legCount);
      if (!walked.ok || !checkItinerary({ legs: walked.legs }, { countries }).ok) return json({ ok: false, reason: 'china', searches: walked.searches });
      return json({ ok: true, legs: walked.legs, price: walked.price, priceTWD: toTWD(walked.price, 'TWD', fx), searches: walked.searches, complete: !walked.partial });
    }

    if (op === 'pos') {
      const market = marketFor(body.market);
      if (!market) return json({ error: 'invalid', detail: 'market' }, 400);
      const priceTWD = Number(body.priceTWD);
      if (!Array.isArray(body.legs) || !body.legs[0]?.segments || !(priceTWD > 0)) return json({ error: 'invalid', detail: 'itinerary' }, 400);
      const key = await pickKey(env, fetchImpl, 1);
      if (key.error) return json({ error: key.error, left: key.left, reserve: key.reserve }, 429);
      const fx = await rates(fetchImpl, now);
      const res = await searchSerpApi({ search }, { apiKey: key.key, currency: market.currency, gl: market.country.toLowerCase(), sortBy: 'price', verifyReturn: 0, fetchImpl });
      const deal = { legs: body.legs, primaryCarrier: String(body.carrier || ''), priceTWD };
      const hit = matchOffer(deal, res.offers, { countries });
      return json({ market: hit ? posResult(deal, market, hit, fx) : null, country: market.country, searches: res.searches });
    }

    return json({ error: 'invalid', detail: 'op' }, 400);
  } catch (e) {
    if (isQuotaError(e)) return json({ error: 'quota-exhausted' }, 429);
    return json({ error: 'provider', detail: redact(e.message).slice(0, 200) }, 502);
  }
}

export default {
  fetch(request) {
    return handle(request);
  },
};
