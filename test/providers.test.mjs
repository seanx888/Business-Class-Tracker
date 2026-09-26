import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSerpApi, buildParams, searchSerpApi } from '../scripts/providers/serpapi.mjs';
import { normalizeDuffel, isoDurationMin, buildBody } from '../scripts/providers/duffel.mjs';
import { demoSearch } from '../scripts/providers/demo.mjs';
import { checkItinerary } from '../web/core/exclusion.js';

const fixture = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('SerpApi request asks for business class and pre-excludes China carriers + hubs', () => {
  const p = buildParams({ origin: 'TPE', destination: 'CDG', departDate: '2026-11-10', returnDate: '2026-11-24' }, { apiKey: 'k' });
  assert.equal(p.get('travel_class'), '3');
  assert.equal(p.get('type'), '1');
  assert.equal(p.get('currency'), 'TWD');
  for (const c of ['CX', 'MU', 'CA', 'CZ', 'NX']) assert.ok(p.get('exclude_airlines').split(',').includes(c), c);
  for (const a of ['HKG', 'MFM', 'PVG', 'PEK']) assert.ok(p.get('exclude_conns').split(',').includes(a), a);
  assert.ok(!p.get('exclude_airlines').split(',').includes('CI'), 'China Airlines must NOT be excluded');
  const ow = buildParams({ origin: 'TPE', destination: 'CDG', departDate: '2026-11-10', returnDate: null }, { apiKey: 'k' });
  assert.equal(ow.get('type'), '2');
  assert.equal(ow.has('return_date'), false);
});

test('SerpApi normalization + filter keeps BR/KE, drops CX via HKG and AF operated by China Eastern', () => {
  const { offers, insights } = normalizeSerpApi(fixture('serpapi-tpe-cdg.json'));
  assert.equal(offers.length, 4);
  assert.deepEqual(insights.typicalRange, [120000, 170000]);
  assert.equal(insights.level, 'low');
  const br = offers.find((o) => o.legs[0].segments[0].carrier === 'BR');
  assert.equal(br.legs[0].segments[0].lieFlat, true);
  assert.equal(br.price, 128500);
  const ok = offers.filter((o) => checkItinerary(o).ok).map((o) => o.legs[0].segments[0].carrier).sort();
  assert.deepEqual(ok, ['BR', 'KE']);
  const af = offers.find((o) => o.legs[0].segments[0].carrier === 'AF');
  assert.equal(af.legs[0].segments[0].operatingName, 'China Eastern Airlines');
});

test('SerpApi verifyReturn checks the cheapest China-free outbound\'s returns and skips HKG ones', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url).searchParams.get('departure_token'));
    return jsonResponse(String(url).includes('departure_token=') ? fixture('serpapi-return.json') : fixture('serpapi-tpe-cdg.json'));
  };
  const res = await searchSerpApi(
    { origin: 'TPE', destination: 'CDG', departDate: '2026-11-10', returnDate: '2026-11-24' },
    { apiKey: 'secret', fetchImpl, verifyReturn: 1, filter: (i) => checkItinerary(i).ok },
  );
  assert.equal(res.searches, 2);
  assert.deepEqual(calls, [null, 'tok-ke'], 'cheapest clean outbound is KE (CX/AF are never candidates)');
  const ke = res.offers.find((o) => o.legs[0].segments[0].carrier === 'KE');
  assert.equal(ke.inboundVerified, true);
  assert.equal(ke.legs[1].segments[0].flightNumber, 'BR 88', 'return via HKG (operated by Cathay) must be skipped');
  assert.equal(ke.price, 128500);
  assert.equal(checkItinerary(ke).ok, true);
  const br = res.offers.find((o) => o.legs[0].segments[0].carrier === 'BR');
  assert.equal(br.inboundVerified, false);
});

test('SerpApi errors surface; "no results" is treated as empty', async () => {
  const q = { origin: 'TPE', destination: 'CDG', departDate: '2026-11-10', returnDate: null };
  const empty = await searchSerpApi(q, { apiKey: 'k', fetchImpl: async () => jsonResponse({ error: "Google Flights hasn't returned any results for this query." }) });
  assert.equal(empty.offers.length, 0);
  await assert.rejects(searchSerpApi(q, { apiKey: 'k', fetchImpl: async () => jsonResponse({ error: 'Invalid API key.' }, 401) }), /Invalid API key/);
});

test('SerpApi retries without pre-filters if Google rejects them', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    seen.push(u.searchParams.has('exclude_airlines'));
    return u.searchParams.has('exclude_airlines') ? jsonResponse({ error: 'Unsupported exclude_airlines value' }, 400) : jsonResponse(fixture('serpapi-tpe-cdg.json'));
  };
  const res = await searchSerpApi({ origin: 'TPE', destination: 'CDG', departDate: '2026-11-10', returnDate: '2026-11-24' }, { apiKey: 'k', fetchImpl });
  assert.deepEqual(seen, [true, false]);
  assert.equal(res.offers.length, 4);
});

test('Duffel: ISO durations', () => {
  assert.equal(isoDurationMin('PT14H10M'), 850);
  assert.equal(isoDurationMin('P1DT2H'), 1560);
  assert.equal(isoDurationMin('PT45M'), 45);
});

test('Duffel request body is a business-class round trip', () => {
  const b = buildBody({ origin: 'TPE', destination: 'AMS', departDate: '2026-11-10', returnDate: '2026-11-24' });
  assert.equal(b.data.cabin_class, 'business');
  assert.equal(b.data.slices.length, 2);
  assert.equal(b.data.slices[1].origin, 'AMS');
});

test('Duffel normalization: both directions verified; MU-operated KLM codeshare via PVG dropped; tech stop checked', () => {
  const { offers, countries } = normalizeDuffel(fixture('duffel-tpe-ams.json'));
  assert.equal(offers.length, 3);
  assert.equal(countries.AMS, 'NL');
  const ci = offers.find((o) => o.owner === 'CI');
  assert.equal(ci.price, 3890);
  assert.equal(ci.currency, 'USD');
  assert.equal(ci.inboundVerified, true);
  assert.equal(ci.legs[0].segments[0].cabin, 'Premium Business');
  const tk = offers.find((o) => o.owner === 'TK');
  assert.equal(tk.legs[0].layovers[0].airport, 'IST');
  assert.equal(tk.legs[0].layovers[0].durationMin, 150);
  assert.equal(tk.legs[1].segments[1].stops[0].airport, 'BKK');
  const ok = offers.filter((o) => checkItinerary(o, { countries }).ok).map((o) => o.owner).sort();
  assert.deepEqual(ok, ['CI', 'TK']);
});

test('demo provider is deterministic and includes traps that the filter removes', () => {
  const q = { origin: 'TPE', destination: 'LHR', departDate: '2026-12-01', returnDate: '2026-12-13', benchmark: { typical: 160000 }, originType: 'home' };
  const a = demoSearch(q);
  const b = demoSearch(q);
  assert.deepEqual(a, b);
  const bad = a.offers.filter((o) => !checkItinerary(o).ok);
  assert.ok(bad.length > 0, 'expected at least one China-routed trap offer');
  assert.ok(a.offers.some((o) => checkItinerary(o).ok));
});
