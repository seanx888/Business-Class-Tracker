// Real Tracker — shared by the PWA (form + display), the daily scanner (search plan) and the sync API.
// A tracker is one trip someone wants watched every day: fixed dates, or ±N flexible days around them.
//
//   { id, o, d, trip: 'rt'|'ow', mode: 'fixed'|'flex', depart, return, flex: 0-7, cabin, maxStops,
//     target, alertOn: 'drop'|'any', notify: 'all'|['sean', …], label, paused, created }
//
// Flexible trackers can't search every date combination every day on a small API budget, so each day
// they re-check the current cheapest dates (to catch price changes) and explore a few more combinations.
import { BLOCKED_AIRPORTS } from './airports.js';

export const CABINS = ['business', 'first', 'premium', 'economy'];
export const MAX_FLEX = 7;
export const FLEX_SEARCHES_PER_DAY = 2;
// A sample older than this no longer counts as the "current" price.
export const SAMPLE_FRESH_DAYS = 7;

const DAY = 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const IATA = /^[A-Z]{3}$/;

export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
export const comboKey = (dep, ret) => `${dep}|${ret || ''}`;

const validDate = (s) => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

/** Stable short id for trackers that arrive without one (e.g. hand-written JSON). */
export function trackerId(t) {
  const s = `${t.o}-${t.d}-${t.depart}-${t.return || ''}-${t.flex || 0}-${t.cabin || ''}`;
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
 * China / Hong Kong / Macau airports are refused, same policy as the rest of the app.
 */
export function normalizeTracker(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'not-an-object' };
  const o = String(raw.o || raw.origin || '').trim().toUpperCase();
  const d = String(raw.d || raw.destination || '').trim().toUpperCase();
  if (!IATA.test(o) || !IATA.test(d)) return { error: 'airport' };
  if (o === d) return { error: 'same-airport' };
  if (BLOCKED_AIRPORTS.has(o) || BLOCKED_AIRPORTS.has(d)) return { error: 'blocked-airport' };
  const depart = String(raw.depart || raw.departDate || '');
  if (!validDate(depart)) return { error: 'depart' };
  let ret = raw.return ?? raw.returnDate ?? null;
  const trip = raw.trip === 'ow' || !ret ? 'ow' : 'rt';
  if (trip === 'rt') {
    if (!validDate(ret)) return { error: 'return' };
    if (ret <= depart) return { error: 'return-before-depart' };
  } else ret = null;
  const flex = raw.mode === 'fixed' ? 0 : clampInt(raw.flex, 0, MAX_FLEX, 0);
  const cabin = CABINS.includes(raw.cabin) ? raw.cabin : 'business';
  const maxStops = raw.maxStops === 0 || raw.maxStops === 1 || raw.maxStops === 2 ? raw.maxStops : null;
  const target = Number(raw.target) > 0 ? Math.round(Number(raw.target)) : null;
  const notify = Array.isArray(raw.notify)
    ? [...new Set(raw.notify.map((n) => String(n).trim().toLowerCase()).filter((n) => /^[a-z0-9_-]{1,32}$/.test(n)))]
    : 'all';
  const tracker = {
    id: /^[A-Za-z0-9_-]{4,40}$/.test(String(raw.id || '')) ? String(raw.id) : null,
    o,
    d,
    trip,
    mode: flex > 0 ? 'flex' : 'fixed',
    depart,
    return: ret,
    flex,
    cabin,
    maxStops,
    target,
    alertOn: raw.alertOn === 'any' ? 'any' : 'drop',
    notify: Array.isArray(notify) && notify.length ? notify : 'all',
    label: raw.label ? String(raw.label).trim().slice(0, 60) : null,
    paused: raw.paused === true,
    created: validDate(raw.created) ? raw.created : null,
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
 */
export function trackerCombos(t, today) {
  const n = t.mode === 'flex' ? t.flex : 0;
  const out = [];
  for (let dd = -n; dd <= n; dd++) {
    for (let dr = t.trip === 'rt' ? -n : 0; dr <= (t.trip === 'rt' ? n : 0); dr++) {
      const dep = addDays(t.depart, dd);
      const ret = t.trip === 'rt' ? addDays(t.return, dr) : null;
      if (dep <= today) continue;
      if (ret && ret <= dep) continue;
      out.push({ dep, ret, dd, dr, key: comboKey(dep, ret) });
    }
  }
  const rank = (c) => (c.dd === 0 && c.dr === 0 ? 0 : c.dd === c.dr ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || Math.abs(a.dd) + Math.abs(a.dr) - (Math.abs(b.dd) + Math.abs(b.dr)) || a.dd - b.dd || a.dr - b.dr);
}

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
