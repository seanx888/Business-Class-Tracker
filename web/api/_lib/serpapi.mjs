// SerpApi — Google Flights engine. https://serpapi.com/google-flights-api
// Pros: Google's own "typical price range" + price level per search (perfect for deal detection).
// Free plan ≈ 250 searches / month → default 8 searches per daily run.
//
// Lives under web/api/_lib/ because Vercel deploys only web/ and the live-search function (api/search.mjs) needs it too;
// scripts/providers/serpapi.mjs re-exports it for the daily scanner.

import { BLOCKED_CARRIERS } from '../../core/airlines.js';
import { includeAirlines, routeSegments } from '../../core/search.js';

const ENDPOINT = 'https://serpapi.com/search.json';

// Connection airports Google should never offer (CN / HK / MO hubs). Post-filter still runs.
export const EXCLUDE_CONNS = [
  'HKG', 'MFM', 'PEK', 'PKX', 'PVG', 'SHA', 'CAN', 'SZX', 'CTU', 'TFU', 'CKG', 'KMG', 'XIY', 'HGH',
  'NKG', 'WUH', 'CSX', 'XMN', 'FOC', 'TAO', 'TSN', 'DLC', 'SHE', 'HRB', 'CGO', 'TNA', 'NNG', 'HAK',
  'SYX', 'URC', 'NGB', 'WNZ', 'JJN', 'ZUH', 'KWL', 'KWE', 'HFE', 'TYN', 'LHW', 'CGQ',
];

// Passenger carriers only (cargo / defunct codes are pointless to send to Google).
const NOT_SEARCHABLE = new Set(['CK', 'O3', 'LD', 'KA']);
const EXCLUDE_AIRLINES = Object.keys(BLOCKED_CARRIERS).filter((c) => !NOT_SEARCHABLE.has(c));

// Google Flights travel_class: 1 economy · 2 premium economy · 3 business · 4 first.
export const TRAVEL_CLASS = { economy: '1', premium: '2', business: '3', first: '4' };
// Google Flights sort_by: 1 top flights · 2 price · 3 departure · 4 arrival · 5 duration · 6 emissions.
export const SORT_BY = { best: '1', price: '2', depart: '3', arrive: '4', duration: '5' };

/**
 * The search a provider query describes. Queries come in two shapes: the original flat one
 * ({ origin, destination, departDate, returnDate, cabin, maxStops }) and `q.search`, a normalized search from
 * web/core/search.js (multi-city, carrier / alliance filter, passengers …). Both end up here.
 */
export function searchOf(q) {
  if (q.search) return q.search;
  return {
    trip: q.returnDate ? 'rt' : 'ow',
    o: q.origin,
    d: q.destination,
    depart: q.departDate,
    return: q.returnDate || null,
    cabin: q.cabin || 'business',
    maxStops: q.maxStops ?? null,
  };
}

// `gl` = Google market (point of sale). The daily scan uses Taiwan; point-of-sale checks re-price
// the same trip in other markets (e.g. gl=vn + currency=VND) to spot cheaper foreign-site fares.
export function buildParams(q, { apiKey, currency = 'TWD', gl = 'tw', deepSearch = false, departureToken = null, preFilter = true, sortBy = null } = {}) {
  const s = searchOf(q);
  const p = new URLSearchParams({
    engine: 'google_flights',
    type: s.trip === 'rt' ? '1' : s.trip === 'ow' ? '2' : '3',
    travel_class: TRAVEL_CLASS[s.cabin] || TRAVEL_CLASS.business,
    adults: String(s.adults || 1),
    currency,
    hl: 'en',
    gl: String(gl).toLowerCase(),
    api_key: apiKey,
  });
  if (s.trip === 'mc') {
    p.set('multi_city_json', JSON.stringify(routeSegments(s).map((l) => ({ departure_id: l.o, arrival_id: l.d, date: l.date }))));
  } else {
    p.set('departure_id', s.o);
    p.set('arrival_id', s.d);
    p.set('outbound_date', s.depart);
    if (s.trip === 'rt' && s.return) p.set('return_date', s.return);
  }
  if (s.children) p.set('children', String(s.children));
  if (s.infantsSeat) p.set('infants_in_seat', String(s.infantsSeat));
  if (s.infantsLap) p.set('infants_on_lap', String(s.infantsLap));
  if (s.maxStops != null) p.set('stops', String(s.maxStops + 1)); // Google: 1 nonstop · 2 ≤1 stop · 3 ≤2 stops
  if (s.bags) p.set('bags', String(s.bags));
  if (s.maxHours) p.set('max_duration', String(s.maxHours * 60));
  const only = includeAirlines(s);
  if (only.length) {
    // Google refuses include_airlines together with exclude_airlines; the strict post-filter still removes China / HK / Macau.
    p.set('include_airlines', only.join(','));
    if (preFilter) p.set('exclude_conns', EXCLUDE_CONNS.join(','));
  } else if (preFilter) {
    p.set('exclude_airlines', EXCLUDE_AIRLINES.join(','));
    p.set('exclude_conns', EXCLUDE_CONNS.join(','));
  }
  if (sortBy && SORT_BY[sortBy]) p.set('sort_by', SORT_BY[sortBy]);
  if (deepSearch) p.set('deep_search', 'true');
  if (departureToken) p.set('departure_token', departureToken);
  return p;
}

function carrierOf(f) {
  const m = /^([A-Z0-9]{2})\s*\d/.exec(f.flight_number || '');
  if (m) return m[1];
  const l = /\/([A-Z0-9]{2})\.png/.exec(f.airline_logo || '');
  return l ? l[1] : '';
}

function operatedBy(f) {
  if (f.plane_and_crew_by) return f.plane_and_crew_by;
  const ext = (f.extensions || []).find((e) => /operated by/i.test(e));
  return ext ? ext.replace(/.*operated by\s*/i, '') : null;
}

function lieFlat(extensions = []) {
  const s = extensions.join(' | ').toLowerCase();
  if (/lie.?flat|flat bed|full.?flat|suite/.test(s)) return true;
  if (/angled flat|recliner|reclining seat|cradle/.test(s)) return false;
  return null;
}

export function normalizeGroup(g) {
  const segments = (g.flights || []).map((f) => ({
    from: f.departure_airport?.id,
    fromName: f.departure_airport?.name,
    dep: f.departure_airport?.time,
    to: f.arrival_airport?.id,
    toName: f.arrival_airport?.name,
    arr: f.arrival_airport?.time,
    carrier: carrierOf(f),
    carrierName: f.airline,
    operatingName: operatedBy(f),
    flightNumber: f.flight_number,
    aircraft: f.airplane,
    cabin: f.travel_class,
    lieFlat: lieFlat(f.extensions),
    durationMin: f.duration,
    overnight: !!f.overnight,
  }));
  const layovers = (g.layovers || []).map((l) => ({
    airport: l.id,
    name: l.name,
    durationMin: l.duration,
    overnight: !!l.overnight,
  }));
  return { segments, layovers, durationMin: g.total_duration };
}

export function normalizeSerpApi(json, currency = 'TWD') {
  const groups = [...(json.best_flights || []), ...(json.other_flights || [])];
  const pi = json.price_insights || null;
  const insights = pi
    ? { lowest: pi.lowest_price ?? null, level: pi.price_level ?? null, typicalRange: pi.typical_price_range ?? null }
    : null;
  const offers = groups
    .filter((g) => Number.isFinite(g.price))
    .map((g) => ({
      price: g.price,
      currency,
      legs: [normalizeGroup(g)],
      departureToken: g.departure_token || null,
      inboundVerified: false,
    }));
  return { offers, insights };
}

const NO_RESULTS = /hasn't returned any results|no results/i;

async function call(params, fetchImpl) {
  const res = await fetchImpl(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(90000) });
  const json = await res.json().catch(() => ({}));
  if (json.error && !NO_RESULTS.test(json.error)) throw new Error(`SerpApi: ${json.error}`);
  if (!res.ok && !json.error) throw new Error(`SerpApi HTTP ${res.status}`);
  return json;
}

/**
 * Walk the remaining legs of one option: each step asks Google for the next leg's flights (`departure_token`), keeps only
 * those the China filter accepts and takes the cheapest. Resolves to { ok, legs, price, searches }; ok is false when some leg
 * has no clean flight. Round trips have one more leg (the return); multi-city trips have as many as the itinerary has.
 * Costs one search per leg walked.
 */
export async function walkLegs(q, option, opts, fetchImpl, legCount) {
  const { filter } = opts;
  const legs = [option.legs[0]];
  let token = option.departureToken;
  let price = option.price;
  let searches = 0;
  for (let i = 1; i < legCount; i++) {
    if (!token) return { ok: true, legs, price, searches, partial: true };
    const next = await call(buildParams(q, { ...opts, departureToken: token }), fetchImpl);
    searches++;
    const options = normalizeSerpApi(next, opts.currency).offers
      .map((r) => ({ price: r.price, leg: r.legs[0], token: r.departureToken }))
      .filter((r) => !filter || filter({ legs: [...legs, r.leg] }))
      .sort((a, b) => a.price - b.price);
    if (!options.length) return { ok: false, searches };
    legs.push(options[0].leg);
    token = options[0].token;
    price = options[0].price;
  }
  return { ok: true, legs, price, searches };
}

/**
 * @param {object} q { origin, destination, departDate, returnDate } or { search } (see searchOf)
 * @param {object} opts { apiKey, currency, deepSearch, verifyReturn, filter, fetchImpl, gl, sortBy }
 *   verifyReturn: number of cheapest options whose remaining legs get fetched & checked
 *   (each costs one extra search per remaining leg). filter(itin) → boolean is the China exclusion check.
 */
export async function searchSerpApi(q, opts) {
  const { fetchImpl = fetch, currency = 'TWD', verifyReturn = 0, filter } = opts;
  let json;
  try {
    json = await call(buildParams(q, opts), fetchImpl);
  } catch (e) {
    // If Google rejects the pre-filter parameters, search unfiltered — the strict post-filter still applies.
    if (!/exclude/i.test(e.message)) throw e;
    opts = { ...opts, preFilter: false };
    json = await call(buildParams(q, opts), fetchImpl);
  }
  const result = normalizeSerpApi(json, currency);
  let searches = 1;

  const s = searchOf(q);
  const legCount = routeSegments(s).length;
  if (legCount > 1 && verifyReturn > 0 && filter) {
    const candidates = result.offers
      .filter((o) => o.departureToken && filter(o))
      .sort((a, b) => a.price - b.price)
      .slice(0, verifyReturn);
    for (const o of candidates) {
      const walked = await walkLegs(q, o, { ...opts, filter }, fetchImpl, legCount);
      searches += walked.searches;
      if (!walked.ok) {
        o.rejected = true; // some leg only routes via CN/HK/MO
      } else {
        o.legs = walked.legs;
        o.price = walked.price;
        o.inboundVerified = !walked.partial;
      }
    }
    result.offers = result.offers.filter((o) => !o.rejected);
  }
  return { ...result, searches };
}

/** SerpApi Account API — free, does not count against the monthly quota. */
export async function serpApiAccount(apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(20000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`SerpApi account: ${j.error || `HTTP ${res.status}`}`);
  const left = Number.isFinite(j.total_searches_left)
    ? j.total_searches_left
    : Number.isFinite(j.plan_searches_left) ? j.plan_searches_left + (j.extra_credits || 0) : null;
  if (left == null) throw new Error('SerpApi account: no quota fields');
  return { left, perMonth: j.searches_per_month ?? null, used: j.this_month_usage ?? null, plan: j.plan_name || null };
}

export const isQuotaError = (e) => /run out of searches|out of searches|searches? (limit|quota)|exceeded|HTTP 429|too many requests/i.test(String(e?.message || e));
