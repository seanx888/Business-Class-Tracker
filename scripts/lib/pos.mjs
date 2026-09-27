// Point-of-sale (POS) checks: is the SAME trip cheaper when bought on another country's
// site / in another currency (e.g. the airline's Vietnam site in VND)? Frequent flyers do this
// with the airline's country selector, a local OTA, or sometimes a VPN.
//
// The daily scan prices everything in the Taiwan market (gl=tw, TWD). For the day's best deals we
// re-run the same search in a few other Google Flights markets and compare after FX conversion.

import { AIRLINES } from '../../web/core/airlines.js';
import { airportCountry } from '../../web/core/airports.js';
import { checkItinerary } from '../../web/core/exclusion.js';
import { toTWD } from './fx.mjs';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Outbound flight numbers, e.g. "CI51" or "KE692.KE901" — identifies the same trip across markets. */
export const outboundSignature = (legs) =>
  (legs?.[0]?.segments || []).map((s) => String(s.flightNumber || s.carrier || '').replace(/\s+/g, '').toUpperCase()).join('.');

/**
 * Markets most likely to beat the home price, in order:
 *   1. the country the ticket starts in (classic ex-station trick: buy ex-BKK in THB),
 *   2. the operating airline's home market,
 *   3. rotating "wildcard" markets so every market gets sampled over time.
 */
export function pickMarkets(deal, markets, { perDeal = 2, dayIdx = 0, homeCountry = 'TW', countries } = {}) {
  const home = homeCountry.toUpperCase();
  const byCountry = new Map(markets.map((m) => [m.country.toUpperCase(), m]));
  const out = [];
  const add = (c) => {
    const m = c && byCountry.get(String(c).toUpperCase());
    if (m && m.country.toUpperCase() !== home && !out.includes(m)) out.push(m);
  };
  add(airportCountry(deal.origin, countries));
  add(AIRLINES[deal.primaryCarrier]?.country);
  const rest = markets.filter((m) => !out.includes(m) && m.country.toUpperCase() !== home);
  const start = rest.length ? (dayIdx + hash(deal.routeKey || '')) % rest.length : 0;
  for (let i = 0; i < rest.length; i++) out.push(rest[(start + i) % rest.length]);
  return out.slice(0, perDeal);
}

/** Find the deal's trip among another market's offers (same outbound flights, else same airline & stops). */
export function matchOffer(deal, offers, { countries } = {}) {
  const clean = offers.filter((o) => Number.isFinite(o.price) && checkItinerary(o, { countries }).ok);
  const sig = outboundSignature(deal.legs);
  const cheapest = (list) => list.sort((a, b) => a.price - b.price)[0] || null;
  const exact = cheapest(clean.filter((o) => outboundSignature(o.legs) === sig));
  if (exact) return { offer: exact, match: 'exact' };
  const nSeg = deal.legs?.[0]?.segments?.length || 0;
  const sameCarrier = cheapest(clean.filter((o) => {
    const segs = o.legs?.[0]?.segments || [];
    return segs.length === nSeg && segs.some((s) => s.carrier === deal.primaryCarrier);
  }));
  return sameCarrier ? { offer: sameCarrier, match: 'carrier' } : null;
}

export function posResult(deal, market, hit, fx) {
  const priceTWD = toTWD(hit.offer.price, hit.offer.currency || market.currency, fx);
  if (!priceTWD) return null;
  const savingsTWD = deal.priceTWD - priceTWD;
  return {
    country: market.country.toUpperCase(),
    currency: hit.offer.currency || market.currency,
    price: Math.round(hit.offer.price),
    priceTWD,
    match: hit.match,
    savingsTWD,
    savingsPct: Math.round((savingsTWD / deal.priceTWD) * 1000) / 10,
  };
}

/** Summary stored on the deal. `best` is set only when a market is meaningfully cheaper. */
export function summarizePos(results, date, minSavingsPct = 3) {
  const markets = results.filter(Boolean).sort((a, b) => a.priceTWD - b.priceTWD);
  const best = markets.find((m) => m.savingsPct >= minSavingsPct) || null;
  return { checked: date, markets, best };
}
