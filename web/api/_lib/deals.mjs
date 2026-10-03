// Turns raw provider offers into the same "deal" objects the daily scan publishes, so the app can render live search results
// with the same cards (scoring, tags, leg timeline) as the Deals tab. Only China-free offers survive.
import { readFileSync } from 'node:fs';
import { checkItinerary } from '../../core/exclusion.js';
import { summarizeItinerary, pickReference, scoreDeal } from '../../core/scoring.js';
import { airportRegion } from '../../core/airports.js';
import { routeSegments, itineraryLine } from '../../core/search.js';
import { toTWD } from './fx.mjs';

let countriesCache = null;
/** IATA → ISO country for ~9,000 airports (OurAirports), so a layover at an airport the app has no entry for can still be verified. */
export function loadCountries() {
  if (countriesCache) return countriesCache;
  try {
    const raw = readFileSync(new URL('../../data/airport-countries.json', import.meta.url), 'utf8');
    countriesCache = JSON.parse(raw);
  } catch {
    countriesCache = {};
  }
  return countriesCache;
}

const compact = (obj) => {
  if (Array.isArray(obj)) return obj.map(compact);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || (Array.isArray(v) && !v.length)) continue;
      out[k] = compact(v);
    }
    return out;
  }
  return obj;
};

/**
 * @param {object[]} offers provider offers ({ price, currency, legs, departureToken, inboundVerified })
 * @param {object} ctx { search, fx, insights, countries, today, provider, homeAirports }
 * @returns {{ deals: object[], excluded: number }}
 */
export function buildDeals(offers, { search, fx, insights = null, countries = loadCountries(), today, provider = 'serpapi', homeAirports = ['TPE', 'TSA', 'KHH'] }) {
  const legsOf = routeSegments(search);
  const first = legsOf[0];
  const insightsTwd = insights ? { ...insights } : null;
  const cur = offers[0]?.currency;
  if (insightsTwd?.typicalRange && cur && cur !== 'TWD') insightsTwd.typicalRange = insightsTwd.typicalRange.map((v) => toTWD(v, cur, fx));
  const reference = pickReference({ insights: insightsTwd });
  const deals = [];
  let excluded = 0;
  for (const offer of offers) {
    if (!checkItinerary(offer, { countries }).ok) {
      excluded++;
      continue;
    }
    const priceTWD = toTWD(offer.price, offer.currency, fx);
    if (!priceTWD) continue;
    const summary = summarizeItinerary(offer, homeAirports);
    const flightIds = offer.legs.map((l) => l.segments.map((s) => (s.flightNumber || s.carrier || '').replace(/\s+/g, '')).join('.')).join('_');
    const deal = {
      id: `${search.trip}-${first.o}-${first.d}-${first.date}-${search.return || ''}-${flightIds}`,
      routeKey: `${first.o}-${first.d}`,
      origin: first.o.split(',')[0],
      destination: first.d.split(',')[0],
      originType: homeAirports.includes(first.o.split(',')[0]) ? 'home' : 'exstation',
      region: airportRegion(first.d.split(',')[0]),
      departDate: first.date,
      returnDate: search.trip === 'rt' ? search.return : null,
      trip: search.trip,
      itinerary: itineraryLine(search),
      legCount: legsOf.length,
      price: offer.price,
      currency: offer.currency,
      priceTWD,
      reference,
      priceLevel: insights?.level || null,
      ...summary,
      legs: offer.legs,
      token: offer.departureToken || null,
      inboundVerified: !!offer.inboundVerified || legsOf.length === 1,
      provider,
      firstSeen: today,
      lastSeen: today,
      ageDays: 0,
    };
    const s = scoreDeal(deal);
    Object.assign(deal, { score: s.score, tier: s.tier, discountPct: s.discountPct, errorFare: s.errorFare });
    deals.push(compact(deal));
  }
  deals.sort((a, b) => a.priceTWD - b.priceTWD);
  return { deals, excluded };
}
