// SerpApi — Google Flights engine. https://serpapi.com/google-flights-api
// Pros: Google's own "typical price range" + price level per search (perfect for deal detection).
// Free plan ≈ 250 searches / month → default 8 searches per daily run.

import { BLOCKED_CARRIERS } from '../../web/core/airlines.js';

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

export function buildParams(q, { apiKey, currency = 'TWD', deepSearch = false, departureToken = null, preFilter = true } = {}) {
  const p = new URLSearchParams({
    engine: 'google_flights',
    departure_id: q.origin,
    arrival_id: q.destination,
    outbound_date: q.departDate,
    type: q.returnDate ? '1' : '2',
    travel_class: '3',
    adults: '1',
    currency,
    hl: 'en',
    gl: 'tw',
    api_key: apiKey,
  });
  if (preFilter) {
    p.set('exclude_airlines', EXCLUDE_AIRLINES.join(','));
    p.set('exclude_conns', EXCLUDE_CONNS.join(','));
  }
  if (q.returnDate) p.set('return_date', q.returnDate);
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
 * @param {object} q { origin, destination, departDate, returnDate }
 * @param {object} opts { apiKey, currency, deepSearch, verifyReturn, filter, fetchImpl }
 *   verifyReturn: number of cheapest outbound options whose return legs get fetched & checked
 *   (each costs one extra search). filter(itin) → boolean is the China exclusion check.
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

  if (q.returnDate && verifyReturn > 0 && filter) {
    const candidates = result.offers
      .filter((o) => o.departureToken && filter(o))
      .sort((a, b) => a.price - b.price)
      .slice(0, verifyReturn);
    for (const o of candidates) {
      const back = await call(buildParams(q, { ...opts, departureToken: o.departureToken }), fetchImpl);
      searches++;
      const returns = normalizeSerpApi(back, currency).offers
        .map((r) => ({ price: r.price, leg: r.legs[0] }))
        .filter((r) => filter({ legs: [o.legs[0], r.leg] }))
        .sort((a, b) => a.price - b.price);
      if (returns.length) {
        o.legs = [o.legs[0], returns[0].leg];
        o.price = returns[0].price;
        o.inboundVerified = true;
      } else {
        o.rejected = true; // every return option routes via CN/HK/MO
      }
    }
    result.offers = result.offers.filter((o) => !o.rejected);
  }
  return { ...result, searches };
}
