// Deal scoring from a seasoned frequent flyer's point of view.
// Price vs. "normal" price dominates; alliance (SkyTeam first) is a secondary nudge;
// product quality (nonstop, lie-flat, no mixed cabin) adjusts the rest.

import { ALLIANCES, allianceOf, BUDGET_PREMIUM } from './airlines.js';
import { distanceKm } from './airports.js';

export const TIERS = [
  { key: 'hot', min: 88 },
  { key: 'great', min: 75 },
  { key: 'good', min: 62 },
  { key: 'fair', min: 0 },
];

export const ALLIANCE_BONUS = {
  off: { SKYTEAM: 0, STAR: 0, ONEWORLD: 0, NONE: 0 },
  standard: { SKYTEAM: 6, STAR: 2, ONEWORLD: 2, NONE: 0 },
  strong: { SKYTEAM: 12, STAR: 2, ONEWORLD: 2, NONE: 0 },
};

const PREMIUM_CABIN = /(business|first|prestige|upper|polaris|club|premium flatbed|skyboss|full.?flat)/i;
const LONG_SEGMENT_MIN = 300; // lie-flat matters from ~5h

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function segDuration(s) {
  if (Number.isFinite(s.durationMin)) return s.durationMin;
  return 0;
}

/** Derive carrier / alliance / product facts from a normalized itinerary. */
export function summarizeItinerary(itin, homeAirports = ['TPE', 'TSA', 'KHH']) {
  const legs = itin.legs || [];
  const segs = legs.flatMap((l) => l.segments || []);
  const outbound = legs[0]?.segments || [];

  const longest = [...outbound].sort((a, b) => segDuration(b) - segDuration(a) || (distanceKm(b.from, b.to) || 0) - (distanceKm(a.from, a.to) || 0))[0] || outbound[0];
  const primaryCarrier = longest?.carrier || outbound[0]?.carrier || '';

  const carriers = [...new Set(segs.map((s) => s.carrier).filter(Boolean))];
  const alliances = [...new Set(carriers.map(allianceOf))];
  const alliance = alliances.length === 1 ? alliances[0] : allianceOf(primaryCarrier);

  const stops = Math.max(0, ...legs.map((l) => Math.max(0, (l.segments?.length || 1) - 1 + (l.segments || []).reduce((n, s) => n + (s.stops?.length || 0), 0))));

  const mixedCabin = segs.some((s) => s.cabin && segDuration(s) >= 90 && !PREMIUM_CABIN.test(s.cabin));

  const longSegs = segs.filter((s) => segDuration(s) >= LONG_SEGMENT_MIN);
  let lieFlat = null;
  if (longSegs.length) {
    if (longSegs.some((s) => s.lieFlat === false)) lieFlat = false;
    else if (longSegs.every((s) => s.lieFlat === true)) lieFlat = true;
  } else if (segs.length && segs.every((s) => s.lieFlat === true)) {
    lieFlat = true;
  }

  const layovers = legs.flatMap((l) => l.layovers || []);
  const longestLayoverMin = Math.max(0, ...layovers.map((l) => l.durationMin || 0));
  const overnightLayover = layovers.some((l) => l.overnight);
  const via = [...new Set(layovers.map((l) => l.airport).filter(Boolean))];
  const viaHome = via.some((a) => homeAirports.includes(a));

  let flownKm = 0;
  let allKnown = outbound.length > 0;
  for (const s of outbound) {
    const d = distanceKm(s.from, s.to);
    if (d == null) allKnown = false;
    else flownKm += d;
  }

  return {
    carriers,
    primaryCarrier,
    budget: BUDGET_PREMIUM.has(primaryCarrier),
    alliance,
    mixedAlliance: alliances.length > 1,
    stops,
    mixedCabin,
    lieFlat,
    longestLayoverMin,
    overnightLayover,
    via,
    viaHome,
    flownKm: allKnown ? flownKm : null,
  };
}

/** Pick the best available "normal price" reference for a deal. */
export function pickReference({ insights, historyMedian, historyCount = 0, benchmark }) {
  const range = insights?.typicalRange;
  if (Array.isArray(range) && range.length === 2 && range[0] > 0 && range[1] > 0) {
    return { source: 'google', value: Math.round((range[0] + range[1]) / 2), low: range[0], high: range[1] };
  }
  if (historyMedian && historyCount >= 5) {
    return { source: 'history', value: Math.round(historyMedian), low: null, high: null };
  }
  if (benchmark?.typical) {
    return { source: 'benchmark', value: benchmark.typical, low: benchmark.deal || null, high: null };
  }
  return null;
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * @param {object} deal published deal (priceTWD, reference, summary fields, priceLevel, ageDays…)
 * @param {object} [prefs] { skyteamBoost: 'off'|'standard'|'strong' }
 */
export function scoreDeal(deal, prefs = {}) {
  const ref = deal.reference?.value;
  const price = deal.priceTWD;
  const discount = ref ? (ref - price) / ref : 0;
  const parts = {};

  // Score against the price a savvy buyer normally CAN get (Google's typical-low, or the
  // median of past daily lows) — not the midpoint — so "cheapest of the day" isn't auto-hot.
  const src = deal.reference?.source;
  const anchor = !ref ? null : src === 'google' && deal.reference.low ? deal.reference.low : src === 'history' ? ref : ref * 0.85;
  parts.price = anchor ? 5 + ((anchor - price) / anchor) * 120 : 0;
  parts.stops = deal.stops === 0 ? 6 : deal.stops === 1 ? 0 : -10;
  parts.product = deal.lieFlat === true ? 4 : deal.lieFlat === false ? -8 : 0;
  parts.mixedCabin = deal.mixedCabin ? -12 : 0;
  parts.layover = (deal.longestLayoverMin > 480 ? -4 : 0) + (deal.overnightLayover ? -2 : 0);
  parts.market = deal.priceLevel === 'low' ? 4 : deal.priceLevel === 'high' ? -4 : 0;
  const bonus = ALLIANCE_BONUS[prefs.skyteamBoost || 'standard'] || ALLIANCE_BONUS.standard;
  parts.alliance = bonus[deal.alliance] ?? 0;
  parts.budget = deal.budget ? -8 : 0;
  parts.exStation = deal.viaHome && deal.originType === 'exstation' ? 3 : 0;
  parts.freshness = -Math.min(6, deal.ageDays || 0);

  const raw = 50 + Object.values(parts).reduce((a, b) => a + b, 0);
  const score = clamp(Math.round(raw), 0, 99);
  const tier = TIERS.find((t) => score >= t.min).key;

  const low = deal.reference?.low;
  const errorFare = !deal.budget && !!(ref && (price <= ref * 0.5 || (deal.reference.source === 'google' && low && price <= low * 0.6)));

  return { score, tier, discountPct: ref ? Math.round(discount * 100) : null, errorFare, parts };
}

export function pricePerKm(deal) {
  const km = deal.flownKm || distanceKm(deal.origin, deal.destination);
  if (!km) return null;
  const total = km * (deal.returnDate ? 2 : 1);
  return deal.priceTWD / total;
}

const allianceRank = (a) => ALLIANCES[a]?.rank ?? 9;

export const SORTS = {
  score: (a, b) => b._score - a._score || allianceRank(a.alliance) - allianceRank(b.alliance) || a.priceTWD - b.priceTWD,
  price: (a, b) => a.priceTWD - b.priceTWD || allianceRank(a.alliance) - allianceRank(b.alliance),
  discount: (a, b) => (b._discount ?? -999) - (a._discount ?? -999) || a.priceTWD - b.priceTWD,
  alliance: (a, b) => allianceRank(a.alliance) - allianceRank(b.alliance) || b._score - a._score,
  cpk: (a, b) => (a._cpk ?? Infinity) - (b._cpk ?? Infinity),
  date: (a, b) => String(a.departDate).localeCompare(String(b.departDate)) || a.priceTWD - b.priceTWD,
};

/** Re-score with the viewer's preferences and sort. Returns new decorated objects. */
export function rankDeals(deals, sortKey = 'score', prefs = {}) {
  const out = deals.map((d) => {
    const s = scoreDeal(d, prefs);
    return { ...d, _score: s.score, _tier: s.tier, _discount: s.discountPct, _errorFare: s.errorFare, _cpk: pricePerKm(d) };
  });
  return out.sort(SORTS[sortKey] || SORTS.score);
}
