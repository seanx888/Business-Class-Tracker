// Flight search model — shared by the PWA form, the live-search API (/api/search) and Real Tracker.
//
// A search is a trip plus the usual Google-Flights filters:
//   { trip: 'rt' | 'ow' | 'mc',                      round trip · one way · multi-city (多段票 / stopovers / open-jaw)
//     o, d, depart, return,                          rt / ow: the two airports (or city codes: "TYO", "NRT,HND") and dates
//     segs: [{ o, d, date }, …],                     mc only, 2–5 legs; o/d/depart above mirror the first leg
//     cabin, maxStops, alliance, airlines,           business (default) · 0/1/2 stops · SKYTEAM|STAR|ONEWORLD · carrier codes
//     adults, children, infantsSeat, infantsLap, bags, maxHours }
//
// A tracker is exactly this plus tracker-only fields (target, alertOn, notify, flex …) — see trackers.js.
// China / Hong Kong / Macau airports and carriers are refused here, same policy as everywhere else.
import { AIRLINES, BLOCKED_CARRIERS } from './airlines.js';
import { parsePlaces, placeString, placeList } from './places.js';

export const CABINS = ['business', 'first', 'premium', 'economy'];
export const TRIPS = ['rt', 'ow', 'mc'];
export const ALLIANCE_KEYS = ['SKYTEAM', 'STAR', 'ONEWORLD'];
export const SORTS = ['price', 'best', 'duration', 'depart', 'arrive'];
export const MAX_SEGS = 5;
export const MAX_AIRLINES = 8;
export const MAX_PAX = 9;

const DAY = 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const CARRIER = /^[A-Z0-9]{2}$/;

export const validDate = (s) => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const shiftDate = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

/** Carrier codes of an alliance's members (blocked carriers are never in the table). */
export function allianceCarriers(alliance) {
  return Object.entries(AIRLINES).filter(([, a]) => a.alliance === alliance).map(([code]) => code);
}

/** Every carrier a search may use: the chosen airlines plus all members of the chosen alliance. [] = no restriction. */
export function includeAirlines({ alliance, airlines } = {}) {
  const out = new Set(airlines || []);
  if (ALLIANCE_KEYS.includes(alliance)) for (const c of allianceCarriers(alliance)) out.add(c);
  return [...out];
}

/**
 * Validate the route part of a search. Returns { route } or { error }.
 * Errors: airport · same-airport · blocked-airport · too-many · depart · return · return-before-depart · segments · segment-order
 */
export function normalizeRoute(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'not-an-object' };
  const trip = raw.trip === 'mc' || (Array.isArray(raw.segs) && raw.segs.length > 1 && raw.trip !== 'rt' && raw.trip !== 'ow')
    ? 'mc'
    : raw.trip === 'ow' || !(raw.return ?? raw.returnDate) ? 'ow' : 'rt';

  const place = (v) => parsePlaces(v);
  if (trip === 'mc') {
    const list = Array.isArray(raw.segs) ? raw.segs : [];
    if (list.length < 2 || list.length > MAX_SEGS) return { error: 'segments' };
    const segs = [];
    for (const s of list) {
      const o = place(s?.o ?? s?.from);
      const d = place(s?.d ?? s?.to);
      if (o.error || d.error) return { error: o.error || d.error };
      const date = String(s?.date ?? '');
      if (!validDate(date)) return { error: segs.length ? 'segment-order' : 'depart' };
      if (segs.length && date < segs[segs.length - 1].date) return { error: 'segment-order' };
      if (o.codes.some((c) => d.codes.includes(c))) return { error: 'same-airport' };
      segs.push({ o: placeString(o.codes), d: placeString(d.codes), date });
    }
    return { route: { trip: 'mc', o: segs[0].o, d: segs[0].d, depart: segs[0].date, return: null, segs } };
  }

  const o = place(raw.o ?? raw.origin);
  const d = place(raw.d ?? raw.destination);
  if (o.error || d.error) return { error: o.error || d.error };
  if (o.codes.some((c) => d.codes.includes(c))) return { error: 'same-airport' };
  const depart = String(raw.depart ?? raw.departDate ?? '');
  if (!validDate(depart)) return { error: 'depart' };
  let ret = raw.return ?? raw.returnDate ?? null;
  if (trip === 'rt') {
    if (!validDate(ret)) return { error: 'return' };
    if (ret <= depart) return { error: 'return-before-depart' };
  } else ret = null;
  return { route: { trip, o: placeString(o.codes), d: placeString(d.codes), depart, return: ret } };
}

/** Filters never fail — out-of-range values are clamped, unknown values dropped. Blocked carriers are reported via `blocked`. */
export function normalizeFilters(raw = {}) {
  const cabin = CABINS.includes(raw.cabin) ? raw.cabin : 'business';
  const maxStops = raw.maxStops === 0 || raw.maxStops === 1 || raw.maxStops === 2 ? raw.maxStops : null;
  const alliance = ALLIANCE_KEYS.includes(raw.alliance) ? raw.alliance : null;
  const wanted = (Array.isArray(raw.airlines) ? raw.airlines : String(raw.airlines || '').split(/[\s,]+/))
    .map((c) => String(c).trim().toUpperCase())
    .filter((c) => CARRIER.test(c));
  const blocked = wanted.filter((c) => Object.prototype.hasOwnProperty.call(BLOCKED_CARRIERS, c));
  const airlines = [...new Set(wanted.filter((c) => !blocked.includes(c)))].slice(0, MAX_AIRLINES);
  const adults = clampInt(raw.adults, 1, MAX_PAX, 1);
  const children = clampInt(raw.children, 0, MAX_PAX - adults, 0);
  const infantsSeat = clampInt(raw.infantsSeat, 0, Math.max(0, MAX_PAX - adults - children), 0);
  const infantsLap = clampInt(raw.infantsLap, 0, adults, 0);
  const bags = clampInt(raw.bags, 0, 2, 0);
  const maxHours = Number(raw.maxHours) > 0 ? clampInt(raw.maxHours, 1, 48, null) : null;
  const sort = SORTS.includes(raw.sort) ? raw.sort : 'price';
  return { filters: { cabin, maxStops, alliance, airlines, adults, children, infantsSeat, infantsLap, bags, maxHours, sort }, blocked };
}

/** Whole search → { search } or { error }. */
export function normalizeSearch(raw) {
  const { route, error } = normalizeRoute(raw);
  if (error) return { error };
  const { filters, blocked } = normalizeFilters(raw);
  if (blocked.length) return { error: 'blocked-airline' };
  return { search: { ...route, ...filters } };
}

/** Legs of any trip as [{ o, d, date }]. A round trip is two legs. */
export function routeSegments(s) {
  if (s.trip === 'mc' && Array.isArray(s.segs) && s.segs.length) return s.segs.map((x) => ({ o: x.o, d: x.d, date: x.date }));
  const legs = [{ o: s.o, d: s.d, date: s.depart }];
  if (s.trip === 'rt' && s.return) legs.push({ o: s.d, d: s.o, date: s.return });
  return legs;
}

export const passengerCount = (s) => (s.adults || 1) + (s.children || 0) + (s.infantsSeat || 0) + (s.infantsLap || 0);

/** True when anything beyond route + cabin narrows the search (such results must not feed the shared route history). */
export function isFiltered(s) {
  return s.trip === 'mc' || s.maxStops != null || !!s.alliance || !!(s.airlines && s.airlines.length) ||
    passengerCount(s) !== 1 || !!s.bags || !!s.maxHours || placeList(s.o).length > 1 || placeList(s.d).length > 1;
}

/** "TPE→CDG→FCO→TPE" style summary of the airports a trip visits (consecutive duplicates collapsed). */
export function itineraryLine(s) {
  const out = [];
  for (const leg of routeSegments(s)) {
    if (!out.length) out.push(leg.o);
    else if (out[out.length - 1] !== leg.o) out.push(leg.o);
    out.push(leg.d);
  }
  return out.join('→');
}

/** Stable key for "have I seen this exact search?" */
export function searchKey(s) {
  return [s.trip, routeSegments(s).map((l) => `${l.o}>${l.d}@${l.date}`).join('/'), s.cabin, s.maxStops ?? '', s.alliance || '', (s.airlines || []).join('.'), passengerCount(s), s.bags || 0, s.maxHours || ''].join('|');
}

// ── Deep links: #routes/search?s=… carries a whole search, so a community card or a friend can open it pre-filled ──
const b64u = (str) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));

/** Compact, URL-safe encoding (defaults omitted). */
export function encodeSearch(s) {
  const o = { t: s.trip, g: routeSegments(s).map((l) => [l.o, l.d, l.date]) };
  if (s.cabin && s.cabin !== 'business') o.c = s.cabin;
  if (s.maxStops != null) o.m = s.maxStops;
  if (s.alliance) o.a = s.alliance;
  if (s.airlines?.length) o.l = s.airlines;
  if ((s.adults || 1) !== 1) o.p = s.adults;
  if (s.children) o.k = s.children;
  if (s.infantsSeat) o.is = s.infantsSeat;
  if (s.infantsLap) o.il = s.infantsLap;
  if (s.bags) o.b = s.bags;
  if (s.maxHours) o.h = s.maxHours;
  return b64u(JSON.stringify(o));
}

export function decodeSearch(str) {
  try {
    const o = JSON.parse(unb64u(str));
    const g = Array.isArray(o.g) ? o.g : [];
    const raw = { trip: o.t, cabin: o.c, maxStops: o.m, alliance: o.a, airlines: o.l, adults: o.p, children: o.k, infantsSeat: o.is, infantsLap: o.il, bags: o.b, maxHours: o.h };
    if (o.t === 'mc') raw.segs = g.map(([x, y, date]) => ({ o: x, d: y, date }));
    else {
      raw.o = g[0]?.[0];
      raw.d = g[0]?.[1];
      raw.depart = g[0]?.[2];
      raw.return = o.t === 'rt' ? g[1]?.[2] : null;
    }
    return normalizeSearch(raw);
  } catch {
    return { error: 'bad-link' };
  }
}

/** Form values for a search that has just been built from pieces (e.g. a parsed post): fills the gaps with sensible defaults. */
export function blankSearch(over = {}) {
  return { trip: 'rt', o: 'TPE', d: '', depart: '', return: '', cabin: 'business', maxStops: null, alliance: null, airlines: [], adults: 1, children: 0, infantsSeat: 0, infantsLap: 0, bags: 0, maxHours: null, sort: 'price', ...over };
}

