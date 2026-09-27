// DEMO provider — synthetic but plausible business-class offers so the app works before
// any API key is configured. Output is clearly labelled as demo data in the UI.
// It deliberately includes "trap" itineraries (Cathay via HKG, China Eastern via PVG,
// codeshares operated by Chinese carriers…) to prove the exclusion filter removes them.

import { AIRPORTS, distanceKm } from '../../web/core/airports.js';
import { AIRLINES, BLOCKED_CARRIERS } from '../../web/core/airlines.js';
import { normalizeGroup } from './serpapi.mjs';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = (s) => s.split(' ');
const JP = 'NRT HND KIX FUK CTS OKA';
const SEA = 'BKK SIN SGN HAN MNL KUL CGK DPS';
const EU = 'CDG AMS LHR FRA MUC VIE PRG FCO MXP ZRH IST';
const NA = 'LAX SFO SEA JFK YVR IAH';
const OC = 'SYD MEL BNE AKL';

// carrier: [hubs, network, price factor, allowed?]  — network = airports served from the hub(s)
const NET = {
  CI: [['TPE'], W(`${JP} ICN ${SEA} ROR AMS FRA VIE FCO PRG LHR LAX SFO SEA ONT JFK YVR SYD MEL BNE AKL`), 1.0],
  BR: [['TPE'], W(`${JP} ICN ${SEA} CDG AMS LHR VIE MUC MXP IST LAX SFO SEA JFK YVR IAH ONT BNE`), 1.02],
  JX: [['TPE'], W(`NRT KIX FUK CTS OKA ${SEA} PRG LAX SFO SEA ONT PHX`), 1.06],
  KE: [['ICN'], W(`TPE NRT KIX FUK ${SEA} ${EU} ${NA} SYD AKL`), 0.95],
  OZ: [['ICN'], W(`TPE NRT KIX BKK SGN HAN MNL SIN LAX SFO SEA JFK CDG FRA LHR FCO SYD`), 0.92],
  VN: [['SGN', 'HAN'], W(`TPE NRT HND KIX ICN BKK SIN KUL CDG FRA LHR MUC SYD MEL SFO`), 0.85],
  GA: [['CGK'], W('NRT HND ICN SYD MEL AMS DPS'), 0.88],
  AF: [['CDG'], W(`ICN NRT HND KIX BKK SIN SGN HAN AMS LHR FRA MUC VIE PRG FCO MXP ZRH IST ${NA}`), 1.05],
  KL: [['AMS'], W(`ICN NRT KIX BKK SIN KUL MNL CDG LHR FRA MUC VIE PRG FCO MXP ZRH IST ${NA}`), 1.03],
  DL: [['SEA'], W('ICN HND LAX SFO JFK IAH YVR ONT PHX'), 1.0],
  JL: [['NRT'], W(`TPE BKK SGN HAN MNL SIN KUL CGK ICN ${NA} DFW LHR CDG FRA HEL HNL SYD`), 1.04],
  NH: [['NRT'], W(`TPE BKK SGN HAN MNL SIN KUL CGK ICN ${NA} ORD LHR CDG FRA MUC VIE HNL SYD PER`), 1.03],
  TG: [['BKK'], W(`TPE NRT HND KIX ICN SIN SGN HAN MNL KUL CGK DPS LHR CDG FRA MUC ZRH CPH SYD MEL`), 0.9],
  SQ: [['SIN'], W(`TPE ${JP} ICN BKK SGN HAN MNL KUL CGK DPS LAX SFO SEA JFK ${EU} ${OC} PER`), 1.1],
  PR: [['MNL'], W(`TPE NRT HND KIX ICN BKK SGN HAN SIN KUL CGK LAX SFO SEA JFK YVR HNL SYD MEL`), 0.82],
  MH: [['KUL'], W(`TPE NRT HND ICN BKK SGN HAN MNL SIN CGK DPS LHR SYD MEL AKL`), 0.86],
  EK: [['DXB'], W(`TPE BKK SGN HAN MNL SIN KUL CGK ${JP} ICN ${EU} ${NA} ${OC}`), 1.0],
  QR: [['DOH'], W(`BKK SGN HAN MNL SIN KUL CGK NRT HND KIX ICN ${EU} ${NA} SYD MEL AKL`), 0.97],
  TK: [['IST'], W(`TPE ${SEA} NRT HND KIX ICN ${EU} ${NA} SYD MEL`), 0.9],
  EY: [['AUH'], W(`BKK MNL SIN KUL CGK NRT ICN ${EU} JFK SYD MEL`), 0.92],
  UA: [['SFO'], W('TPE NRT HND ICN SIN SYD MEL LAX SEA JFK IAH YVR ONT PHX LHR FRA MUC CDG AMS'), 1.05],
  LH: [['FRA'], W(`ICN NRT HND KIX BKK SIN CDG AMS LHR MUC VIE PRG FCO MXP ZRH IST ${NA}`), 1.05],
  ZG: [['NRT'], W('ICN BKK MNL LAX SFO SEA HNL YVR'), 0.55],
  VJ: [['SGN', 'HAN'], W('TPE ICN NRT KIX BKK SIN KUL SYD MEL BNE PER'), 0.6],
  TW: [['ICN'], W('TPE NRT KIX FUK BKK SGN HAN SIN CDG FCO FRA SYD'), 0.62],
  D7: [['KUL'], W('TPE NRT KIX ICN SYD MEL AKL'), 0.5],
};

// Tempting options that MUST be filtered out (they never reach the app).
const TRAPS = {
  CX: [['HKG'], W(`TPE ${JP} ICN ${SEA} ${EU} ${NA} ${OC}`), 0.8],
  MU: [['PVG'], W(`TPE NRT KIX ICN ${SEA} ${EU} ${NA} SYD MEL AKL`), 0.55],
  CA: [['PEK'], W(`TPE NRT KIX ICN ${SEA} ${EU} ${NA} SYD MEL`), 0.6],
  CZ: [['CAN'], W(`TPE NRT KIX ICN ${SEA} ${EU} ${NA} ${OC}`), 0.58],
};

const CODESHARE_TRAPS = [
  { carrier: 'KE', hub: 'CAN', operatingName: 'China Southern Airlines', factor: 0.66 },
  { carrier: 'DL', hub: 'PVG', operatingName: 'China Eastern Airlines', factor: 0.62 },
  { carrier: 'TG', hub: 'HKG', operatingName: null, factor: 0.72 }, // TG really flies TPE–HKG–BKK
];

const TZ = { TW: 8, JP: 9, KR: 9, TH: 7, VN: 7, PH: 8, SG: 8, MY: 8, ID: 7, KH: 7, PW: 9, GU: 10, FR: 1, NL: 1, GB: 0, DE: 1, AT: 1, CZ: 1, IT: 1, CH: 1, ES: 1, PT: 0, DK: 1, SE: 1, NO: 1, FI: 2, GR: 2, TR: 3, AE: 4, QA: 3, US: -8, CA: -8, AU: 10, NZ: 12, FJ: 12, IN: 5.5, BE: 1, HU: 1, PL: 1, RO: 2, IE: 0, CN: 8, HK: 8, MO: 8 };
const TZ_AIRPORT = { JFK: -5, EWR: -5, BOS: -5, IAD: -5, ATL: -5, MIA: -5, DTW: -5, YYZ: -5, YUL: -5, IAH: -6, DFW: -6, ORD: -6, MSP: -6, DEN: -7, PHX: -7, SLC: -7, HNL: -10, DPS: 8, PER: 8 };
const TRAP_COUNTRY = { HKG: 'HK', PVG: 'CN', PEK: 'CN', CAN: 'CN' };

const tzOf = (code) => TZ_AIRPORT[code] ?? TZ[AIRPORTS[code]?.country || TRAP_COUNTRY[code]] ?? 8;

const TRAP_COORDS = { HKG: [22.31, 113.91], PVG: [31.14, 121.81], PEK: [40.08, 116.58], CAN: [23.39, 113.3] };
function km(a, b) {
  const d = distanceKm(a, b);
  if (d != null) return d;
  const pa = AIRPORTS[a] ? [AIRPORTS[a].lat, AIRPORTS[a].lon] : TRAP_COORDS[a];
  const pb = AIRPORTS[b] ? [AIRPORTS[b].lat, AIRPORTS[b].lon] : TRAP_COORDS[b];
  if (!pa || !pb) return 2000;
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(pb[0] - pa[0]) / 2) ** 2 + Math.cos(r(pa[0])) * Math.cos(r(pb[0])) * Math.sin(r(pb[1] - pa[1]) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)));
}

const pad = (n) => String(n).padStart(2, '0');
function fmt(utcMs, code) {
  const d = new Date(utcMs + tzOf(code) * 3600000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const AIRCRAFT = {
  CI: ['Airbus A350-900', 'Boeing 777-300ER', 'Airbus A350-900'],
  BR: ['Boeing 777-300ER', 'Boeing 787-10', 'Boeing 787-9'],
  JX: ['Airbus A350-900', 'Airbus A350-1000', 'Airbus A330-900neo'],
  EK: ['Airbus A380', 'Boeing 777-300ER'],
  VJ: ['Airbus A330-300'],
  D7: ['Airbus A330-300'],
  ZG: ['Boeing 787-8'],
  TW: ['Airbus A330-200'],
};
const WIDE = ['Boeing 787-9', 'Airbus A350-900', 'Boeing 777-300ER', 'Airbus A330-300', 'Boeing 787-10'];
const NARROW = { CI: 'Airbus A321neo', BR: 'Airbus A321neo', JX: 'Airbus A321neo', VJ: 'Airbus A321', TW: 'Boeing 737-800' };

function segment(r, carrier, from, to, depUtc, { operatingName = null, economy = false } = {}) {
  const dist = km(from, to);
  const dur = Math.round((dist / 820) * 60 + 35);
  const narrow = dist < 1500 && NARROW[carrier] && r() < 0.5;
  const pool = AIRCRAFT[carrier] || WIDE;
  const aircraft = narrow ? NARROW[carrier] : pool[Math.floor(r() * pool.length)];
  const recliner = narrow || carrier === 'TW';
  const flightNo = `${carrier} ${Math.floor(r() * 900) + 10}`;
  const ext = recliner ? ['Recliner seat', 'In-seat power & USB outlets'] : ['Lie flat seat', 'Wi-Fi for a fee', 'On-demand video'];
  return {
    seg: {
      departure_airport: { id: from, name: AIRPORTS[from]?.en || from, time: fmt(depUtc, from) },
      arrival_airport: { id: to, name: AIRPORTS[to]?.en || to, time: fmt(depUtc + dur * 60000, to) },
      duration: dur,
      airplane: aircraft,
      airline: AIRLINES[carrier]?.en || BLOCKED_CARRIERS[carrier] || carrier,
      airline_logo: `https://www.gstatic.com/flights/airline_logos/70px/${carrier}.png`,
      travel_class: economy ? 'Economy' : 'Business',
      flight_number: flightNo,
      extensions: ext,
      ...(operatingName ? { plane_and_crew_by: operatingName } : {}),
    },
    arrUtc: depUtc + dur * 60000,
  };
}

function buildLeg(r, carrier, path, dateIso, opts = {}) {
  const [y, m, d] = dateIso.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d, 0, 0) - tzOf(path[0]) * 3600000 + (7 + Math.floor(r() * 16)) * 3600000 + (r() < 0.5 ? 1800000 : 0);
  const flights = [];
  const layovers = [];
  for (let i = 0; i < path.length - 1; i++) {
    const economy = opts.mixedCabin && i === 0 && path.length > 2;
    const { seg, arrUtc } = segment(r, carrier, path[i], path[i + 1], t, { ...opts, economy });
    flights.push(seg);
    if (i < path.length - 2) {
      const overnight = r() < 0.12;
      const lay = overnight ? 540 + Math.floor(r() * 300) : 70 + Math.floor(r() * 170);
      layovers.push({ duration: lay, name: AIRPORTS[path[i + 1]]?.en || path[i + 1], id: path[i + 1], overnight });
      t = arrUtc + lay * 60000;
    } else t = arrUtc;
  }
  const total = flights.reduce((n, f) => n + f.duration, 0) + layovers.reduce((n, l) => n + l.duration, 0);
  return { flights, layovers, total_duration: total };
}

function routingsFor(o, d, net) {
  const out = [];
  for (const [carrier, [hubs, network, factor]] of Object.entries(net)) {
    const serves = (a) => network.includes(a) || hubs.includes(a);
    if (hubs.includes(o) && serves(d)) out.push({ carrier, path: [o, d], factor });
    else if (hubs.includes(d) && serves(o)) out.push({ carrier, path: [o, d], factor });
    else if (network.includes(o) && network.includes(d)) {
      // Skip absurd back-tracking connections (e.g. TPE→SGN→ICN).
      if (km(o, hubs[0]) + km(hubs[0], d) <= 1.7 * km(o, d)) out.push({ carrier, path: [o, hubs[0], d], factor });
    }
  }
  return out;
}

const round100 = (x) => Math.round(x / 100) * 100;

/** q: { origin, destination, departDate, returnDate, benchmark:{typical}, originType } */
export function demoSearch(q) {
  const r = rng(hash(`${q.origin}-${q.destination}-${q.departDate}-${q.returnDate}`));
  const typical = (q.benchmark?.typical || 60000) * (q.originType === 'exstation' ? 0.85 : 1);

  const legit = routingsFor(q.origin, q.destination, NET).sort(() => r() - 0.5).slice(0, 9);
  const traps = routingsFor(q.origin, q.destination, TRAPS).sort(() => r() - 0.5).slice(0, 2);
  for (const c of CODESHARE_TRAPS) {
    if (r() < 0.35 && q.origin !== q.destination) traps.push({ carrier: c.carrier, path: [q.origin, c.hub, q.destination], factor: c.factor, operatingName: c.operatingName });
  }

  const groups = [...legit, ...traps].map((rt) => {
    const mixedCabin = rt.path.length > 2 && r() < 0.08;
    const legOpts = { operatingName: rt.operatingName, mixedCabin };
    const out = buildLeg(r, rt.carrier, rt.path, q.departDate, legOpts);
    const back = q.returnDate ? buildLeg(r, rt.carrier, [...rt.path].reverse(), q.returnDate, legOpts) : null;
    let f = rt.factor * (0.9 + r() * 0.45) * (rt.path.length === 2 ? 1.08 : 1);
    if (r() < 0.05) f *= 0.68; // occasional flash sale / fare mistake
    return { price: round100(typical * f), out, back };
  });

  const offers = groups.map((g) => ({
    price: g.price,
    currency: 'TWD',
    legs: [g.out, g.back].filter(Boolean).map(normalizeGroup),
    inboundVerified: !!g.back,
  }));
  const prices = offers.map((o) => o.price);
  const range = [round100(typical * 0.82), round100(typical * 1.18)];
  const lowest = prices.length ? Math.min(...prices) : null;
  const insights = r() < 0.85 && lowest
    ? { lowest, level: lowest < range[0] ? 'low' : lowest > range[1] ? 'high' : 'typical', typicalRange: range }
    : null;
  return { offers, insights, searches: 1 };
}

// Markets where cheaper point-of-sale fares are more often reported (demo bias only).
const POS_BIAS = { VN: -0.04, ID: -0.04, IN: -0.03, TH: -0.02, PH: -0.02 };

/**
 * Demo point-of-sale check: the same itinerary priced in another market's currency.
 * Deterministic per deal + market; some markets come out cheaper, some pricier.
 */
export function demoPos(q, market, { fx, deal }) {
  const country = market.country.toUpperCase();
  const r = rng(hash(`${deal.id}|${country}`));
  const factor = 0.84 + r() * 0.24 + (POS_BIAS[country] ?? 0);
  const rate = fx?.rates?.[market.currency];
  if (!rate) return { offers: [], insights: null, searches: 1 };
  const price = Math.round(deal.priceTWD * factor * rate);
  return {
    offers: [{ price, currency: market.currency, legs: deal.legs, inboundVerified: deal.inboundVerified }],
    insights: null,
    searches: 1,
  };
}
