import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle, searchConfigured } from '../web/api/search.mjs';
import { signSession, hashPassword, COOKIE, AUTH_VAR } from '../web/api/_lib/auth.mjs';
import { buildParams, searchSerpApi } from '../web/api/_lib/serpapi.mjs';
import { normalizeSearch } from '../web/core/search.js';
import { checkItinerary } from '../web/core/exclusion.js';
import { fakeGitHub } from './helpers/github.mjs';
import { ensureCountries, loadCountries } from '../web/api/_lib/deals.mjs';

const fixture = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const NOW = Date.parse('2026-10-03T03:00:00Z');
const env = {
  PASSWORD_USERA: 'usera-initial-pass-1', PASSWORD_USERB: 'userb-initial-pass-2', SESSION_SECRET: 's'.repeat(40),
  TRACKERS_GITHUB_TOKEN: 'ghp_test', TRACKERS_REPO: 'me/repo', SERPAPI_KEY: 'serp-secret-key-1',
};
const own = { usera: { hash: await hashPassword('usera-own-password-9'), at: '' }, userb: { hash: await hashPassword('userb-own-password-8'), at: '' } };
const gh = () => fakeGitHub({ [AUTH_VAR]: JSON.stringify(own) });

// ── a stand-in for SerpApi: answers by query, records every call ──
const flight = (from, to, dep, arr, carrier, num, dur, over = {}) => ({
  departure_airport: { id: from, name: from, time: dep },
  arrival_airport: { id: to, name: to, time: arr },
  duration: dur,
  airline: carrier,
  airline_logo: `https://www.gstatic.com/flights/airline_logos/70px/${carrier}.png`,
  travel_class: 'Business',
  flight_number: `${carrier} ${num}`,
  extensions: ['Lie flat seat'],
  ...over,
});
const group = (flights, price, token) => ({ flights, total_duration: flights.reduce((n, f) => n + f.duration, 0), price, ...(token ? { departure_token: token } : {}) });

function serp({ left = 200, answer } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    if (u.hostname === 'serpapi.com' && u.pathname === '/account.json') return Response.json({ total_searches_left: left });
    if (u.hostname === 'serpapi.com' && u.pathname === '/search.json') {
      calls.push(u.searchParams);
      const out = answer ? await answer(u.searchParams) : fixture('serpapi-tpe-cdg.json');
      return Response.json(out);
    }
    if (u.hostname === 'api.github.com') return github.fetchImpl(url, init);
    throw new Error('offline');
  };
  const github = gh();
  return { calls, fetchImpl };
}

let tick = 0; // each request gets its own clock reading so the per-person rate window never carries over between tests
const session = (name = 'usera') => `${COOKIE}=${signSession(name, env, own, { now: NOW })}`;
const req = (body, { cookie = session(), method = 'POST', headers = {}, query = '' } = {}) =>
  new Request(`https://app.example/api/search${query}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json', origin: 'https://app.example', host: 'app.example' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
const run = (request, { fetchImpl, e = env } = {}) => handle(request, { env: e, fetchImpl, now: NOW + (tick += 11 * 60 * 1000) });
const RT = { o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2027-01-05' };

test('ping is public; search needs sign-in AND a SerpApi key', async () => {
  const { fetchImpl } = serp();
  assert.deepEqual(await (await run(req(null, { cookie: null, method: 'GET', query: '?ping=1' }), { fetchImpl })).json(), { configured: true });
  assert.deepEqual(await (await run(req(null, { cookie: null, method: 'GET', query: '?ping=1' }), { fetchImpl, e: { ...env, SERPAPI_KEY: '' } })).json(), { configured: false });
  assert.deepEqual(await (await run(req(null, { cookie: null, method: 'GET', query: '?ping=1' }), { fetchImpl, e: { ...env, TRACKERS_GITHUB_TOKEN: '' } })).json(), { configured: false });
  assert.equal(searchConfigured({ ...env, SERPAPI_KEY: '', SERPAPI_KEY_2: 'k2' }), true);
  assert.equal((await run(req({ op: 'search', search: RT }), { fetchImpl, e: { ...env, SERPAPI_KEY: '' } })).status, 501);
});

test('signed-out visitors, cross-site posts and the initial password are refused before SerpApi is touched', async () => {
  const s = serp();
  assert.equal((await run(req({ op: 'search', search: RT }, { cookie: null }), s)).status, 401);
  assert.equal((await run(req({ op: 'search', search: RT }, { headers: { origin: 'https://evil.example' } }), s)).status, 403);
  const form = new Request('https://app.example/api/search', { method: 'POST', headers: { cookie: session(), origin: 'https://app.example', host: 'app.example', 'content-type': 'text/plain' }, body: '{}' });
  assert.equal((await run(form, s)).status, 403);
  assert.equal((await run(req(null, { method: 'GET' }), s)).status, 405);
  const initial = fakeGitHub({});
  const sess = `${COOKIE}=${signSession('usera', env, {}, { now: NOW })}`;
  assert.equal((await run(req({ op: 'search', search: RT }, { cookie: sess }), { fetchImpl: async (u, i) => (String(u).includes('github') ? initial.fetchImpl(u, i) : s.fetchImpl(u, i)) })).status, 403, 'still on the initial password');
  assert.equal(s.calls.length, 0);
});

test('invalid searches are 400 with the reason; China / HK / Macau never reach SerpApi', async () => {
  const s = serp();
  const bad = async (search) => {
    const res = await run(req({ op: 'search', search }), s);
    return [res.status, (await res.json()).detail];
  };
  assert.deepEqual(await bad({ ...RT, d: 'HKG' }), [400, 'blocked-airport']);
  assert.deepEqual(await bad({ ...RT, depart: 'soon' }), [400, 'depart']);
  assert.deepEqual(await bad({ ...RT, airlines: ['CX'] }), [400, 'blocked-airline']);
  assert.deepEqual(await bad(null), [400, 'not-an-object']);
  assert.equal((await run(req({ op: 'nope', search: RT }), s)).status, 400);
  assert.equal(s.calls.length, 0);
});

test('search: returns China-free deals cheapest first, with Google\'s price insights in TWD', async () => {
  const s = serp();
  const res = await run(req({ op: 'search', search: { ...RT, cabin: 'business' } }), s);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual(j.deals.map((d) => d.primaryCarrier), ['KE', 'BR'], 'cheapest first');
  assert.equal(j.found, 4);
  assert.equal(j.excluded, 2, 'Cathay via HKG and the Air France ticket operated by China Eastern');
  assert.equal(j.searches, 1);
  assert.deepEqual(j.insights.typicalRange, [120000, 170000]);
  assert.equal(j.deals.every((d) => checkItinerary(d).ok), true);
  assert.equal(j.deals[0].itinerary, 'TPE→CDG→TPE');
  assert.equal(j.quota.left, 199);
  const p = s.calls[0];
  assert.equal(p.get('travel_class'), '3');
  assert.equal(p.get('sort_by'), '2', 'cheapest first');
  assert.equal(p.get('gl'), 'tw');
  assert.ok(!JSON.stringify(j).includes('serp-secret-key-1'), 'the API key never leaves the server');
});

test('search: alliance, airlines, stops and passengers become SerpApi filters', () => {
  const { search } = normalizeSearch({ ...RT, alliance: 'SKYTEAM', airlines: ['BR'], maxStops: 0, adults: 2, children: 1, bags: 1, maxHours: 20, cabin: 'first' });
  const p = buildParams({ search }, { apiKey: 'k' });
  assert.equal(p.get('travel_class'), '4');
  assert.equal(p.get('stops'), '1', 'nonstop only');
  assert.equal(p.get('adults'), '2');
  assert.equal(p.get('children'), '1');
  assert.equal(p.get('bags'), '1');
  assert.equal(p.get('max_duration'), '1200');
  const only = p.get('include_airlines').split(',');
  assert.ok(['BR', 'CI', 'KE', 'DL'].every((c) => only.includes(c)));
  assert.equal(p.has('exclude_airlines'), false, 'Google refuses include + exclude together');
  assert.match(p.get('exclude_conns'), /HKG/, 'China hubs are still pre-excluded');
  const plain = buildParams({ search: normalizeSearch(RT).search }, { apiKey: 'k' });
  assert.equal(plain.has('stops'), false);
  assert.ok(plain.get('exclude_airlines').split(',').includes('CX'));
});

const MC = {
  trip: 'mc',
  segs: [
    { o: 'CRK', d: 'TPE', date: '2026-11-01' },
    { o: 'TPE', d: 'FCO', date: '2026-11-04' },
    { o: 'FCO', d: 'TPE', date: '2026-11-15' },
  ],
};
// A synthetic multi-city conversation: leg 1 → leg 2 → leg 3 (shaped like SerpApi's documented responses).
const mcAnswer = (p) => {
  const token = p.get('departure_token');
  if (!token) {
    return {
      best_flights: [
        group([flight('CRK', 'TPE', '2026-11-01 10:00', '2026-11-01 12:05', 'CI', 902, 125)], 21000, 'leg1-ci'),
        group([flight('CRK', 'HKG', '2026-11-01 07:00', '2026-11-01 09:00', 'CX', 900, 120), flight('HKG', 'TPE', '2026-11-01 11:00', '2026-11-01 12:30', 'CX', 470, 90)], 15000, 'leg1-cx'),
      ],
      price_insights: { lowest_price: 15000, price_level: 'typical', typical_price_range: [20000, 30000] },
    };
  }
  if (token === 'leg1-ci') {
    return {
      best_flights: [
        group([flight('TPE', 'AUH', '2026-11-04 18:40', '2026-11-04 23:40', 'EY', 867, 540), flight('AUH', 'FCO', '2026-11-05 03:00', '2026-11-05 07:00', 'EY', 83, 360)], 24500, 'leg2-ey'),
        group([flight('TPE', 'HKG', '2026-11-04 18:00', '2026-11-04 19:50', 'CX', 465, 110), flight('HKG', 'FCO', '2026-11-04 23:00', '2026-11-05 06:00', 'CX', 293, 780)], 19000, 'leg2-cx'),
      ],
    };
  }
  if (token === 'leg2-ey') {
    return { best_flights: [group([flight('FCO', 'AUH', '2026-11-15 10:25', '2026-11-15 19:00', 'EY', 84, 395), flight('AUH', 'TPE', '2026-11-16 02:00', '2026-11-16 09:00', 'EY', 868, 420)], 31800)] };
  }
  return { best_flights: [] };
};

test('multi-city: the legs go to SerpApi as multi_city_json, results show leg 1 and the through price', async () => {
  const s = serp({ answer: mcAnswer });
  const res = await run(req({ op: 'search', search: MC }), s);
  const j = await res.json();
  assert.equal(res.status, 200);
  const p = s.calls[0];
  assert.equal(p.get('type'), '3');
  assert.equal(p.has('departure_id'), false);
  assert.deepEqual(JSON.parse(p.get('multi_city_json')), [
    { departure_id: 'CRK', arrival_id: 'TPE', date: '2026-11-01' },
    { departure_id: 'TPE', arrival_id: 'FCO', date: '2026-11-04' },
    { departure_id: 'FCO', arrival_id: 'TPE', date: '2026-11-15' },
  ]);
  assert.equal(j.deals.length, 1, 'the Cathay-via-Hong-Kong option is dropped');
  const d = j.deals[0];
  assert.equal(d.primaryCarrier, 'CI');
  assert.equal(d.legCount, 3);
  assert.equal(d.itinerary, 'CRK→TPE→FCO→TPE');
  assert.equal(d.inboundVerified, false, 'only leg 1 is known yet');
  assert.equal(d.token, 'leg1-ci');
  assert.equal(j.excluded, 1);
});

test('multi-city: verify walks the remaining legs; an option whose later leg only routes via Hong Kong disappears', async () => {
  const s = serp({ answer: mcAnswer });
  const res = await run(req({ op: 'search', search: MC, verify: 1 }), s);
  const j = await res.json();
  assert.equal(j.searches, 3, 'leg 1 + two more legs for the cheapest clean option');
  assert.deepEqual(s.calls.map((c) => c.get('departure_token')), [null, 'leg1-ci', 'leg2-ey']);
  const d = j.deals[0];
  assert.equal(d.legs.length, 3);
  assert.equal(d.priceTWD, 31800, 'the final leg carries the through price');
  assert.equal(d.inboundVerified, true);
  assert.deepEqual(d.legs.map((l) => l.segments[0].flightNumber), ['CI 902', 'EY 867', 'EY 84']);

  // If every second-leg option routes via Hong Kong the whole option is rejected.
  const s2 = serp({ answer: (p) => (p.get('departure_token') === 'leg1-ci' ? { best_flights: [mcAnswer(p).best_flights[1]] } : mcAnswer(p)) });
  const j2 = await (await run(req({ op: 'search', search: MC, verify: 1 }), s2)).json();
  assert.equal(j2.deals.length, 0);
});

test('complete: loads the rest of one option on demand', async () => {
  const s = serp({ answer: mcAnswer });
  const first = (await (await run(req({ op: 'search', search: MC }), s)).json()).deals[0];
  const s2 = serp({ answer: mcAnswer });
  const res = await run(req({ op: 'complete', search: MC, token: first.token, firstLeg: first.legs[0], price: first.price }), s2);
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.equal(j.legs.length, 3);
  assert.equal(j.price, 31800);
  assert.equal(j.complete, true);
  assert.equal(s2.calls.length, 2);
  assert.equal((await run(req({ op: 'complete', search: RT === MC ? MC : { ...RT, return: null }, token: 'x', firstLeg: first.legs[0] }), s2)).status, 400, 'single-leg trips have nothing to complete');
  assert.equal((await run(req({ op: 'complete', search: MC, token: '', firstLeg: first.legs[0] }), s2)).status, 400);
});

const vnAnswer = (p) => {
  if (p.get('gl') === 'vn') {
    const base = fixture('serpapi-tpe-cdg.json');
    return { ...base, best_flights: base.best_flights.map((g) => ({ ...g, price: Math.round(g.price * 28 * 0.9) })), other_flights: [], price_insights: undefined };
  }
  return fixture('serpapi-tpe-cdg.json');
};

test('pos: the same flights priced for another country\'s market, converted to TWD', async () => {
  const s = serp({ answer: vnAnswer });
  const base = await (await run(req({ op: 'search', search: RT }), s)).json();
  const best = base.deals.find((d) => d.primaryCarrier === 'BR');
  const res = await run(req({ op: 'pos', search: RT, market: 'vn', legs: best.legs, carrier: 'BR', priceTWD: best.priceTWD }), s);
  const j = await res.json();
  assert.equal(res.status, 200);
  const call = s.calls[s.calls.length - 1];
  assert.equal(call.get('gl'), 'vn');
  assert.equal(call.get('currency'), 'VND');
  assert.equal(j.country, 'VN');
  assert.equal(j.market.country, 'VN');
  assert.equal(j.market.match, 'exact');
  assert.ok(j.market.priceTWD > 0 && j.market.priceTWD < best.priceTWD * 1.1);
  assert.equal(typeof j.market.savingsPct, 'number');
  assert.equal((await run(req({ op: 'pos', search: RT, market: 'XX', legs: best.legs, priceTWD: 1 }), s)).status, 400);
  assert.equal((await run(req({ op: 'pos', search: RT, market: 'VN', legs: [], priceTWD: 1 }), s)).status, 400);
});

test('quota: live search keeps a reserve for the daily scan and falls over to the second key', async () => {
  const low = serp({ left: 50 });
  const res = await run(req({ op: 'search', search: RT }), low);
  assert.equal(res.status, 429);
  const j = await res.json();
  assert.deepEqual([j.error, j.left, j.reserve], ['quota-reserve', 50, 60]);
  assert.equal(low.calls.length, 0);
  // key 1 is low, key 2 has plenty → key 2 is used
  const keys = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    if (u.pathname === '/account.json') return Response.json({ total_searches_left: u.searchParams.get('api_key') === 'serp-secret-key-1' ? 10 : 150 });
    if (u.pathname === '/search.json') {
      keys.push(u.searchParams.get('api_key'));
      return Response.json(fixture('serpapi-tpe-cdg.json'));
    }
    return gh().fetchImpl(url, init);
  };
  const ok = await run(req({ op: 'search', search: RT }), { fetchImpl, e: { ...env, SERPAPI_KEY_2: 'serp-key-2' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(keys, ['serp-key-2']);
  const tuned = serp({ left: 20 });
  assert.equal((await run(req({ op: 'search', search: RT }), { ...tuned, e: { ...env, SEARCH_RESERVE: '5' } })).status, 200, 'the reserve is adjustable');
});

test('provider failures are 502 without the key; running out of searches is 429; too many requests are limited', async () => {
  const boom = serp({ answer: () => { throw new Error('socket hang up serp-secret-key-1'); } });
  const res = await run(req({ op: 'search', search: RT }), boom);
  assert.equal(res.status, 502);
  const j = await res.json();
  assert.equal(j.error, 'provider');
  assert.ok(!JSON.stringify(j).includes('serp-secret-key-1'));
  const dry = serp({ answer: () => ({ error: 'Your account has run out of searches.' }) });
  assert.equal((await run(req({ op: 'search', search: RT }), dry)).status, 429);

  const s = serp();
  const same = new Date(NOW).getTime();
  let last;
  for (let i = 0; i < 31; i++) last = await handle(req({ op: 'search', search: RT }, { cookie: session('userb') }), { env, fetchImpl: s.fetchImpl, now: same + i });
  assert.equal(last.status, 429);
  assert.equal((await last.json()).error, 'rate-limited');
});

test('searchSerpApi: a multi-city search with verify off costs exactly one search', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url).searchParams);
    return Response.json(mcAnswer(new URL(url).searchParams));
  };
  const { search } = normalizeSearch(MC);
  const r = await searchSerpApi({ search }, { apiKey: 'k', fetchImpl, filter: (i) => checkItinerary(i).ok });
  assert.equal(r.searches, 1);
  assert.equal(calls.length, 1);
  assert.equal(r.offers.length, 2, 'raw offers; the China filter is applied by the caller');
});

test('the API ships its own copy of the airport-country table (Vercel deploys only web/) and it matches config/', () => {
  const web = readFileSync(new URL('../web/data/airport-countries.json', import.meta.url));
  const config = readFileSync(new URL('../config/airport-countries.json', import.meta.url));
  assert.ok(web.equals(config), 'run: node scripts/update-airports.mjs, or copy config/airport-countries.json to web/data/');
  const vercel = JSON.parse(readFileSync(new URL('../web/vercel.json', import.meta.url), 'utf8'));
  assert.equal(vercel.functions['api/search.mjs'].maxDuration, 60);
});

test('the airport-country table: read from the bundle, or asked of the site itself when the file is not in the function', async () => {
  assert.ok(Object.keys(loadCountries()).length > 5000, 'the bundled table');
  const table = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`A${String(i).padStart(2, '0')}`, 'XX']));
  const calls = [];
  const site = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify(table), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const fromSite = await ensureCountries('https://example.vercel.app', site, {});
  assert.deepEqual(calls, ['https://example.vercel.app/data/airport-countries.json']);
  assert.equal(Object.keys(fromSite).length, 200);
  // a broken answer never replaces the fail-closed behaviour
  const broken = await ensureCountries('https://example.vercel.app', async () => new Response('<html>', { status: 200 }), {});
  assert.ok(Object.keys(broken).length === 200 || Object.keys(broken).length === 0);
  const down = await ensureCountries('https://example.vercel.app', async () => { throw new Error('offline'); }, {});
  assert.ok(typeof down === 'object');
});
