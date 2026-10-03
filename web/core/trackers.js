// Real Tracker — shared by the PWA (form + display), the daily scanner (search plan) and the sync API.
// A tracker is one trip someone wants watched every day: fixed dates, or ±N flexible days around them.
//
//   { id, o, d, trip: 'rt'|'ow'|'mc', mode: 'fixed'|'flex', depart, return, flex: 0-7, cabin, maxStops,
//     target, alertOn: 'drop'|'any', notify: 'all'|['usera', …], label, paused, created,
//     // optional — only present when set, so trackers made before multi-city / filters existed are unchanged:
//     segs: [{ o, d, date }, …]            multi-city legs (o / d / depart mirror the first leg)
//     airlines: ['CI', …], alliance        include only these carriers / this alliance
//     adults, children, infantsSeat, infantsLap, bags, maxHours
//     pos: true                            also price the best itinerary in other countries' markets (cheapest place to pay)
//   }
//
// Flexible trackers can't search every date combination every day on a small API budget, so each day
// they re-check the current cheapest dates (to catch price changes) and explore a few more combinations.
// A flexible multi-city tracker shifts ALL legs together (the trip keeps its shape).
import {
  CABINS, MAX_SEGS, normalizeRoute, normalizeFilters, routeSegments, shiftDate, validDate, isFiltered,
} from './search.js';

export { CABINS, MAX_SEGS };
export const MAX_FLEX = 7;
export const FLEX_SEARCHES_PER_DAY = 2;
// A sample older than this no longer counts as the "current" price.
export const SAMPLE_FRESH_DAYS = 7;

const DAY = 86400000;

export const addDays = shiftDate;
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
export const comboKey = (dep, ret) => `${dep}|${ret || ''}`;

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

// Filter fields that are stored only when they differ from the default.
function filterExtras(f) {
  const x = {};
  if (f.airlines.length) x.airlines = f.airlines;
  if (f.alliance) x.alliance = f.alliance;
  if (f.adults !== 1) x.adults = f.adults;
  if (f.children) x.children = f.children;
  if (f.infantsSeat) x.infantsSeat = f.infantsSeat;
  if (f.infantsLap) x.infantsLap = f.infantsLap;
  if (f.bags) x.bags = f.bags;
  if (f.maxHours) x.maxHours = f.maxHours;
  return x;
}

/** Stable short id for trackers that arrive without one (e.g. hand-written JSON). */
export function trackerId(t) {
  let s = `${t.o}-${t.d}-${t.depart}-${t.return || ''}-${t.flex || 0}-${t.cabin || ''}`;
  if (t.trip === 'mc') s += `|mc:${(t.segs || []).map((x) => `${x.o}>${x.d}@${x.date}`).join('/')}`;
  if (t.alliance) s += `|${t.alliance}`;
  if (t.airlines?.length) s += `|${t.airlines.join('.')}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `t${(h >>> 0).toString(36)}`;
}

export function newTrackerId() {
  const rnd = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 2 ** 32, Date.now()];
  return `t${(rnd[0] >>> 0).toString(36)}${(rnd[1] >>> 0).toString(36).slice(-3)}`;
}

/**
 * Validate and clean one tracker. Returns { tracker } or { error } — never throws.
 * China / Hong Kong / Macau airports and carriers are refused, same policy as the rest of the app.
 */
export function normalizeTracker(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'not-an-object' };
  const { route, error } = normalizeRoute({ ...raw, o: raw.o ?? raw.origin, d: raw.d ?? raw.destination });
  if (error) return { error };
  const { filters, blocked } = normalizeFilters(raw);
  if (blocked.length) return { error: 'blocked-airline' };
  const flex = raw.mode === 'fixed' ? 0 : clampInt(raw.flex, 0, MAX_FLEX, 0);
  const target = Number(raw.target) > 0 ? Math.round(Number(raw.target)) : null;
  const notify = Array.isArray(raw.notify)
    ? [...new Set(raw.notify.map((n) => String(n).trim().toLowerCase()).filter((n) => /^[a-z0-9_-]{1,32}$/.test(n)))]
    : 'all';
  const tracker = {
    id: /^[A-Za-z0-9_-]{4,40}$/.test(String(raw.id || '')) ? String(raw.id) : null,
    o: route.o,
    d: route.d,
    trip: route.trip,
    mode: flex > 0 ? 'flex' : 'fixed',
    depart: route.depart,
    return: route.return,
    flex,
    cabin: filters.cabin,
    maxStops: filters.maxStops,
    target,
    alertOn: raw.alertOn === 'any' ? 'any' : 'drop',
    notify: Array.isArray(notify) && notify.length ? notify : 'all',
    label: raw.label ? String(raw.label).trim().slice(0, 60) : null,
    paused: raw.paused === true,
    created: validDate(raw.created) ? raw.created : null,
    ...(route.segs ? { segs: route.segs } : {}),
    ...filterExtras(filters),
    ...(raw.pos === true ? { pos: true } : {}),
  };
  if (!tracker.id) tracker.id = trackerId(tracker);
  return { tracker };
}

/** Parse trackers from any number of JSON strings / arrays; invalid entries are reported, duplicates (same id) dropped. */
export function parseTrackers(sources, log = () => {}) {
  const out = new Map();
  for (const src of sources) {
    let list = src;
    if (typeof src === 'string') {
      if (!src.trim()) continue;
      try {
        list = JSON.parse(src);
      } catch {
        log('⚠ TRACKERS is not valid JSON — ignored');
        continue;
      }
    }
    for (const raw of [].concat(list || [])) {
      const { tracker, error } = normalizeTracker(raw);
      if (error) {
        log(`⚠ tracker ${raw?.id || JSON.stringify(raw)?.slice(0, 60)} skipped: ${error}`);
        continue;
      }
      if (!out.has(tracker.id)) out.set(tracker.id, tracker);
    }
  }
  return [...out.values()];
}

/**
 * Every date combination a tracker covers that is still in the future, best-first:
 * the exact dates, then same-length trips shifted ±1…±N days, then the rest (closest first).
 * Multi-city: one combination per shift of the whole trip (dr is always 0, legs move together); `dep` is the first leg's date.
 */
export function trackerCombos(t, today) {
  const n = t.mode === 'flex' ? t.flex : 0;
  const out = [];
  const rt = t.trip === 'rt';
  for (let dd = -n; dd <= n; dd++) {
    for (let dr = rt ? -n : 0; dr <= (rt ? n : 0); dr++) {
      const dep = addDays(t.depart, dd);
      const ret = rt ? addDays(t.return, dr) : null;
      if (dep <= today) continue;
      if (ret && ret <= dep) continue;
      out.push({ dep, ret, dd, dr, key: comboKey(dep, ret) });
    }
  }
  const rank = (c) => (c.dd === 0 && c.dr === 0 ? 0 : c.dd === c.dr ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || Math.abs(a.dd) + Math.abs(a.dr) - (Math.abs(b.dd) + Math.abs(b.dr)) || a.dd - b.dd || a.dr - b.dr);
}

/** The legs of a tracker for one date combination: [{ o, d, date }] (multi-city legs shift together). */
export function comboLegs(t, combo) {
  if (t.trip === 'mc') return (t.segs || []).map((s) => ({ o: s.o, d: s.d, date: addDays(s.date, combo.dd) }));
  const legs = [{ o: t.o, d: t.d, date: combo.dep }];
  if (t.trip === 'rt' && combo.ret) legs.push({ o: t.d, d: t.o, date: combo.ret });
  return legs;
}

/** The normalized search a tracker runs for one date combination (what the provider is asked). */
export function comboSearch(t, combo) {
  const legs = comboLegs(t, combo);
  const base = {
    trip: t.trip,
    o: t.o,
    d: t.d,
    depart: combo.dep,
    return: t.trip === 'rt' ? combo.ret : null,
    cabin: t.cabin,
    maxStops: t.maxStops ?? null,
    alliance: t.alliance || null,
    airlines: t.airlines || [],
    adults: t.adults || 1,
    children: t.children || 0,
    infantsSeat: t.infantsSeat || 0,
    infantsLap: t.infantsLap || 0,
    bags: t.bags || 0,
    maxHours: t.maxHours || null,
  };
  return t.trip === 'mc' ? { ...base, segs: legs } : base;
}

/** True when this tracker's prices must stay out of the shared per-route price history. */
export const trackerFiltered = (t) => isFiltered({ ...t, adults: t.adults || 1, children: t.children || 0, infantsSeat: t.infantsSeat || 0, infantsLap: t.infantsLap || 0 });

export const comboCount = (t) => (t.mode === 'flex' ? (2 * t.flex + 1) * (t.trip === 'rt' ? 2 * t.flex + 1 : 1) : 1);
export const searchesPerDay = (t) => (t.mode === 'flex' ? Math.min(FLEX_SEARCHES_PER_DAY, comboCount(t)) : 1);

/** Tracker is over once its latest possible departure date has passed. */
export function trackerExpired(t, today) {
  return addDays(t.depart, t.mode === 'flex' ? t.flex : 0) <= today;
}

/** Cheapest sample seen within the freshness window (ties → most recently checked). */
export function bestSample(samples = {}, today, validKeys = null) {
  let best = null;
  for (const [key, s] of Object.entries(samples)) {
    if (validKeys && !validKeys.has(key)) continue;
    if (!Number.isFinite(s?.p) || daysBetween(s.at, today) > SAMPLE_FRESH_DAYS) continue;
    if (!best || s.p < best.p || (s.p === best.p && s.at > best.at)) best = { key, ...s };
  }
  if (!best) return null;
  const [dep, ret] = best.key.split('|');
  return { ...best, dep, ret: ret || null };
}

export { routeSegments };
