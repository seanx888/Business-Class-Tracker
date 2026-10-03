// Real Tracker — server side: which tracker dates to search today, what was found, and when to alert.
// State lives in web/data/trackers.json (public, like history.json): results only — labels, names
// and e-mail addresses stay in the private TRACKERS / ALERT_EMAILS settings.
import {
  trackerCombos, trackerExpired, searchesPerDay, bestSample, comboKey, daysBetween, comboSearch, trackerFiltered, SAMPLE_FRESH_DAYS,
} from '../../web/core/trackers.js';
import { itineraryLine } from '../../web/core/search.js';

const KEEP_SAMPLE_DAYS = 21;
const KEEP_REMOVED_DAYS = 14; // a tracker missing from TRACKERS keeps its history this long (guards against a bad edit)
const MIN_CHANGE_TWD = 1000;
const MIN_CHANGE_PCT = 0.03;
const POS_KEEP_DAYS = 14; // a foreign-market price older than this is forgotten
const POS_MIN_SAVINGS_PCT = 3; // below this a market is "about the same"
const POS_ALERT_PCT = 8; // an alert is worth sending from this much cheaper

export function emptyTrackerState() {
  return { version: 1, provider: null, trackers: {} };
}

// Public copy of the definition (no label / notify list).
const publicDef = (t) => ({
  o: t.o, d: t.d, trip: t.trip, mode: t.mode, depart: t.depart, return: t.return, flex: t.flex, cabin: t.cabin, maxStops: t.maxStops, target: t.target,
  ...(t.segs ? { segs: t.segs } : {}),
  ...(t.airlines ? { airlines: t.airlines } : {}),
  ...(t.alliance ? { alliance: t.alliance } : {}),
  ...(t.adults ? { adults: t.adults } : {}),
  ...(t.children ? { children: t.children } : {}),
  ...(t.pos ? { pos: true } : {}),
});

/** Short key that names a tracker's route in logs and state: "TPE-CDG", or "MC:CRK-TPE-FCO-TPE" for multi-city. */
export const trackerRouteKey = (t) => (t.trip === 'mc' ? `MC:${itineraryLine(t).replace(/→/g, '-')}` : `${t.o}-${t.d}`);

/**
 * Pick today's tracker searches within `budget`: every active tracker gets one search (least recently
 * searched first), then flexible trackers get their extra exploration searches.
 * Each search re-checks the current best dates first, then unexplored dates, then the stalest ones.
 */
export function planTrackerSearches(trackers, state, { today, budget }) {
  const active = trackers.filter((t) => !t.paused && !trackerExpired(t, today));
  const wanted = new Map();
  for (const t of active) {
    const combos = trackerCombos(t, today);
    if (!combos.length) continue;
    const st = state.trackers[t.id] || {};
    const samples = st.samples || {};
    const valid = new Set(combos.map((c) => c.key));
    const best = bestSample(samples, today, valid);
    const order = [];
    if (best) order.push(combos.find((c) => c.key === best.key));
    order.push(...combos.filter((c) => !samples[c.key]));
    order.push(...combos.filter((c) => samples[c.key]).sort((a, b) => samples[a.key].at.localeCompare(samples[b.key].at)));
    const seen = new Set();
    const picks = [];
    for (const c of order) {
      if (!c || seen.has(c.key)) continue;
      seen.add(c.key);
      picks.push(c);
      if (picks.length >= searchesPerDay(t)) break;
    }
    wanted.set(t.id, { t, picks, last: st.lastSearched || '' });
  }
  const queue = [...wanted.values()].sort((a, b) => a.last.localeCompare(b.last) || a.t.id.localeCompare(b.t.id));
  const plan = [];
  for (let round = 0; plan.length < budget; round++) {
    let added = false;
    for (const { t, picks } of queue) {
      if (plan.length >= budget) break;
      const c = picks[round];
      if (!c) continue;
      added = true;
      const search = comboSearch(t, c);
      plan.push({
        kind: 'tracker',
        trackerId: t.id,
        key: trackerRouteKey(t),
        origin: t.o.split(',')[0],
        destination: t.d.split(',')[0],
        departDate: c.dep,
        returnDate: c.ret,
        cabin: t.cabin,
        maxStops: t.maxStops,
        // Multi-city, carrier / alliance filters, passengers … : the provider asks Google for exactly this search, and the
        // results stay out of the shared per-route price history (they are not "the" price of the route).
        search,
        filtered: trackerFiltered(t),
        label: null,
      });
    }
    if (!added) break;
  }
  return plan;
}

const flightList = (legs) => legs.map((l) => (l.segments || []).map((s) => s.flightNumber || s.carrier).join(' · ')).filter(Boolean);

/**
 * Record the cheapest acceptable result of one tracker search.
 * `clean` = China-free offers already converted to TWD and summarized (priceTWD, stops, primaryCarrier, legs…).
 */
export function recordTrackerSample(state, q, clean, { today, insights = null } = {}) {
  const st = (state.trackers[q.trackerId] ||= { samples: {}, history: [] });
  st.samples ||= {};
  st.lastSearched = today;
  const ok = clean.filter((d) => q.maxStops == null || d.stops <= q.maxStops).sort((a, b) => a.priceTWD - b.priceTWD);
  const key = comboKey(q.departDate, q.returnDate);
  const best = ok[0];
  if (!best) {
    st.samples[key] = { p: null, at: today, none: true };
    return null;
  }
  const s = {
    p: best.priceTWD,
    at: today,
    c: best.primaryCarrier,
    s: best.stops,
    via: best.via?.length ? best.via : undefined,
    dur: best.legs?.[0]?.durationMin || undefined,
    lf: best.lieFlat ?? undefined,
    fl: flightList(best.legs || []),
    n: ok.length,
  };
  if (insights?.level) s.lvl = insights.level;
  if (insights?.typicalRange?.length === 2) s.typ = insights.typicalRange.map((v) => Math.round(v));
  st.samples[key] = s;
  return s;
}

/**
 * After today's searches: refresh best / daily history / lows for every tracker, prune old samples,
 * mark expired / paused / removed trackers. Returns the tracker list with today's best attached.
 */
export function updateTrackerState(state, trackers, today) {
  const byId = new Map(trackers.map((t) => [t.id, t]));
  for (const [id, st] of Object.entries(state.trackers)) {
    if (byId.has(id)) {
      delete st.removedSince;
      continue;
    }
    st.removedSince ||= today;
    st.status = 'removed';
    if (daysBetween(st.removedSince, today) > KEEP_REMOVED_DAYS) delete state.trackers[id];
  }
  for (const t of trackers) {
    const st = (state.trackers[t.id] ||= { samples: {}, history: [] });
    st.def = publicDef(t);
    st.samples ||= {};
    st.history ||= [];
    const combos = trackerCombos(t, today);
    const valid = new Set(combos.map((c) => c.key));
    for (const [k, s] of Object.entries(st.samples)) {
      if (!valid.has(k) || daysBetween(s.at, today) > KEEP_SAMPLE_DAYS) delete st.samples[k];
    }
    const best = bestSample(st.samples, today, valid);
    st.best = best || null;
    if (best && st.lastSearched === today) {
      const entry = [today, best.p, best.dep, best.ret, best.c];
      const last = st.history[st.history.length - 1];
      if (last?.[0] === today) st.history[st.history.length - 1] = entry;
      else st.history.push(entry);
      st.history = st.history.slice(-180);
      if (!st.low || best.p < st.low.p) st.low = { p: best.p, date: today, dep: best.dep, ret: best.ret };
      if (!st.first) st.first = { p: best.p, date: today };
    }
    st.status = trackerExpired(t, today) ? 'expired' : t.paused ? 'paused' : best ? 'tracking' : st.lastSearched ? 'no-results' : 'waiting';
    st.combos = combos.length;
    st.checked = Object.values(st.samples).filter((s) => daysBetween(s.at, today) <= SAMPLE_FRESH_DAYS).length;
  }
  return trackers.map((t) => ({ tracker: t, st: state.trackers[t.id] }));
}

/**
 * Which other-country market to price a tracker's best itinerary in today: the one checked longest ago
 * (never-checked first), so every market is sampled in turn. `markets` = [{ country, currency }].
 */
export function pickTrackerMarkets(pos, markets, { n = 1, home = 'TW' } = {}) {
  const seen = new Map((pos?.markets || []).map((m) => [m.country, m.at]));
  return markets
    .filter((m) => m.country.toUpperCase() !== home)
    .map((m, i) => ({ m, at: seen.get(m.country.toUpperCase()) || '', i }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.i - b.i)
    .slice(0, n)
    .map((x) => x.m);
}

/**
 * Store one market's answer on the tracker: { country, currency, price, priceTWD, savingsPct } from lib/pos.mjs posResult,
 * or { country, none: true } when that market did not offer the same flights. `best` = the market that is meaningfully cheaper.
 */
export function recordTrackerPos(state, trackerId, entry, today) {
  const st = state.trackers[trackerId];
  if (!st || !entry?.country) return null;
  const pos = (st.pos ||= { markets: [] });
  pos.markets = pos.markets.filter((m) => m.country !== entry.country && daysBetween(m.at, today) <= POS_KEEP_DAYS);
  pos.markets.push({ ...entry, at: today });
  pos.markets.sort((a, b) => (a.priceTWD ?? Infinity) - (b.priceTWD ?? Infinity));
  pos.checked = today;
  pos.best = pos.markets.find((m) => !m.none && m.savingsPct >= POS_MIN_SAVINGS_PCT) || null;
  return pos;
}

/**
 * Google-Flights-style alerts, compared with the last price we told people about:
 *   start   — first result for a new tracker ("now tracking, current lowest …")
 *   target  — at/below the tracker's target price (again only if it gets cheaper)
 *   drop    — same dates got significantly cheaper
 *   dates   — other dates in the flexible window are now significantly cheaper
 *   rise    — significantly more expensive (only when alertOn = 'any'; otherwise the baseline moves silently)
 *   pos     — (trackers with pos: true) the same flights are meaningfully cheaper on another country's site
 * Significant = at least NT$1,000 and 3 %.
 */
export function evaluateTrackerAlerts(state, trackers, today) {
  const alerts = [];
  for (const t of trackers) {
    const st = state.trackers[t.id];
    const best = st?.best;
    if (!best || st.lastSearched !== today || t.paused) continue;
    const prev = st.alert;
    const isLow = !!st.low && st.low.date === today && (st.history.length > 1);
    let kind = null;
    if (!prev) kind = 'start';
    else {
      const delta = best.p - prev.p;
      const significant = Math.abs(delta) >= Math.max(MIN_CHANGE_TWD, prev.p * MIN_CHANGE_PCT);
      // Crossing the target always alerts; once under it, only further significant drops do.
      const targetHit = t.target && best.p <= t.target && (prev.p > t.target || (delta < 0 && significant));
      if (targetHit) kind = 'target';
      else if (delta < 0 && significant) kind = best.key === prev.key ? 'drop' : 'dates';
      else if (delta > 0 && significant) kind = t.alertOn === 'any' ? 'rise' : 'rise-silent';
    }
    if (!kind) continue;
    // A first result that is already under the target is worth a target alert.
    if (kind === 'start' && t.target && best.p <= t.target) kind = 'target';
    st.alert = { p: best.p, date: today, kind, key: best.key };
    if (kind === 'rise-silent') continue;
    alerts.push({ tracker: t, kind, best, prev: prev || null, low: st.low || null, isLow: kind !== 'start' && isLow });
  }
  // "Cheaper to pay in another country": rides along with a price alert, or stands alone as kind 'pos'.
  for (const t of trackers) {
    const st = state.trackers[t.id];
    const pb = st?.pos?.best;
    if (!t.pos || t.paused || !pb || pb.at !== today || pb.savingsPct < POS_ALERT_PCT) continue;
    const told = st.posAlert;
    if (told && told.country === pb.country && pb.priceTWD > told.priceTWD * 0.95) continue; // already told, not meaningfully cheaper
    st.posAlert = { country: pb.country, priceTWD: pb.priceTWD, date: today };
    const same = alerts.find((a) => a.tracker.id === t.id);
    if (same) same.pos = pb;
    else if (st.best && st.lastSearched === today) alerts.push({ tracker: t, kind: 'pos', best: st.best, prev: null, low: st.low || null, isLow: false, pos: pb });
  }
  return alerts;
}
