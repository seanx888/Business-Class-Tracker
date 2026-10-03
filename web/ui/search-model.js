// The search form as plain data — no DOM, no strings to translate — so its rules can be tested in Node.
//
// A form keeps what the person typed ("東京", "TPE, KIX") and turns it into the normalized search of core/search.js only when
// a search or a tracker is made. Multi-city is a list of legs; a round trip / one way uses the first two fields.
import { resolvePlaces, placeList } from '../core/places.js';
import {
  normalizeSearch, normalizeFilters, shiftDate, validDate, passengerCount, routeSegments, MAX_SEGS, MAX_AIRLINES, MAX_PAX, ALLIANCE_KEYS,
} from '../core/search.js';
import { normalizeTracker, trackerCombos, searchesPerDay, comboCount, FLEX_SEARCHES_PER_DAY } from '../core/trackers.js';
import { AIRLINES, isBlockedCarrierCode, isBlockedCarrierName } from '../core/airlines.js';

export const PAX = ['adults', 'children', 'infantsSeat', 'infantsLap'];
export const FLEX_CHOICES = [1, 2, 3, 5, 7];

/** A fresh form: Taipei → anywhere, business class, round trip two months out. */
export function blankForm(today, over = {}) {
  const dep = shiftDate(today, 60);
  const ret = shiftDate(dep, 7);
  return {
    trip: 'rt', o: 'TPE', d: '', depart: dep, return: ret,
    segs: [{ o: 'TPE', d: '', date: dep }, { o: '', d: 'TPE', date: ret }],
    cabin: 'business', maxStops: null, alliance: null, airlines: [],
    adults: 1, children: 0, infantsSeat: 0, infantsLap: 0, bags: 0, maxHours: '',
    sort: 'price',
    // tracking options — a tracker is made from the same form
    track: false, target: '', mode: 'fixed', flex: 3, alertOn: 'drop', notify: 'all', label: '', pos: false,
    id: null, created: null,
    ...over,
  };
}

const join = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));

/** A normalized search (or tracker) back into form values. */
export function formFromSearch(s, base) {
  const f = base ? { ...base } : blankForm(s.depart || s.segs?.[0]?.date);
  Object.assign(f, {
    trip: s.trip, cabin: s.cabin || 'business', maxStops: s.maxStops ?? null, alliance: s.alliance || null, airlines: [...(s.airlines || [])],
    adults: s.adults || 1, children: s.children || 0, infantsSeat: s.infantsSeat || 0, infantsLap: s.infantsLap || 0, bags: s.bags || 0, maxHours: s.maxHours || '',
  });
  if (s.trip === 'mc') {
    f.segs = (s.segs || []).map((x) => ({ o: join(x.o), d: join(x.d), date: x.date }));
    f.o = f.segs[0]?.o || '';
    f.d = f.segs[0]?.d || '';
    f.depart = f.segs[0]?.date || '';
    f.return = f.segs[f.segs.length - 1]?.date || '';
  } else {
    f.o = join(s.o);
    f.d = join(s.d);
    f.depart = s.depart || '';
    f.return = s.trip === 'rt' ? s.return || '' : shiftDate(s.depart, 7);
    f.segs = [{ o: f.o, d: f.d, date: f.depart }, { o: f.d, d: f.o, date: f.return }];
  }
  return f;
}

export function formFromTracker(tr, today) {
  const f = formFromSearch(tr, blankForm(today));
  Object.assign(f, {
    track: true, id: tr.id, created: tr.created || null,
    target: tr.target || '', mode: tr.mode === 'flex' ? 'flex' : 'fixed', flex: tr.flex || 3, alertOn: tr.alertOn === 'any' ? 'any' : 'drop',
    notify: tr.notify ?? 'all', label: tr.label || '', pos: !!tr.pos,
  });
  return f;
}

/** Switching between round trip / one way / multi-city keeps what was typed. */
export function switchTrip(f, trip) {
  if (trip === f.trip) return f;
  const out = { ...f, trip };
  if (trip === 'mc') {
    const segs = f.trip === 'rt' || f.trip === 'ow'
      ? [{ o: f.o, d: f.d, date: f.depart }, f.trip === 'rt' ? { o: f.d, d: f.o, date: f.return } : { o: f.d, d: '', date: shiftDate(f.depart, 5) }]
      : f.segs;
    out.segs = segs.map((s) => ({ ...s }));
  } else if (f.trip === 'mc') {
    const first = f.segs[0] || { o: f.o, d: f.d, date: f.depart };
    const last = f.segs[f.segs.length - 1] || first;
    out.o = first.o;
    out.d = first.d;
    out.depart = first.date;
    if (trip === 'rt') out.return = last.date && last.date > first.date ? last.date : shiftDate(first.date, 7);
  } else if (trip === 'rt' && !(f.return > f.depart)) out.return = shiftDate(f.depart, 7);
  return out;
}

export function addSeg(f, { backHome = false } = {}) {
  if (f.segs.length >= MAX_SEGS) return f;
  const last = f.segs[f.segs.length - 1] || { o: '', d: '', date: f.depart };
  const next = { o: last.d, d: backHome ? f.segs[0].o : '', date: validDate(last.date) ? shiftDate(last.date, 4) : '' };
  return { ...f, segs: [...f.segs, next] };
}

export function removeSeg(f, i) {
  if (f.segs.length <= 2) return f;
  return { ...f, segs: f.segs.filter((_, k) => k !== i) };
}

/** A leg's origin follows the previous leg's destination until the person changes it themselves. */
export function setSeg(f, i, key, value) {
  const segs = f.segs.map((s) => ({ ...s }));
  const before = segs[i][key];
  segs[i][key] = value;
  const next = segs[i + 1];
  if (key === 'd' && next && (!next.o || next.o === before)) next.o = value;
  return { ...f, segs };
}

/** Adults / children / infants within the 9-seat limit and one lap infant per adult. */
export function bumpPax(f, key, delta) {
  const { filters } = normalizeFilters({ ...f, [key]: Math.max(0, (Number(f[key]) || 0) + delta) });
  return { ...f, adults: filters.adults, children: filters.children, infantsSeat: filters.infantsSeat, infantsLap: filters.infantsLap };
}

export const paxTotal = (f) => passengerCount({ adults: f.adults, children: f.children, infantsSeat: f.infantsSeat, infantsLap: f.infantsLap });

/** Add a carrier typed by name or code. → { airlines } | { error: 'blocked' | 'unknown' | 'ambiguous' | 'full' | 'dup' } */
export function addAirline(list, text) {
  const raw = String(text ?? '').trim();
  if (!raw) return { airlines: list };
  const up = raw.toUpperCase();
  let code = null;
  if (/^[A-Z0-9]{2}$/.test(up)) {
    if (isBlockedCarrierCode(up)) return { error: 'blocked' };
    if (AIRLINES[up]) code = up;
  }
  if (!code) {
    if (isBlockedCarrierName(raw)) return { error: 'blocked' };
    const q = raw.toLowerCase();
    const all = Object.entries(AIRLINES);
    const exact = all.filter(([, a]) => a.en.toLowerCase() === q || a.zh === raw);
    const loose = exact.length ? exact : all.filter(([, a]) => a.en.toLowerCase().includes(q) || a.zh.includes(raw));
    if (loose.length > 1) return { error: 'ambiguous' };
    if (!loose.length) return { error: 'unknown' };
    code = loose[0][0];
  }
  if (list.includes(code)) return { error: 'dup' };
  if (list.length >= MAX_AIRLINES) return { error: 'full' };
  return { airlines: [...list, code] };
}

/**
 * Form → normalized search. Places are resolved from names; errors say which field to blame.
 * @returns {{ search: object } | { error: string, field: string }}
 */
export function buildSearch(f, { today = null } = {}) {
  const place = (text, field) => {
    const r = resolvePlaces(text);
    return r.error ? { error: r.error, field } : { value: r.codes.join(',') };
  };
  const filters = {
    cabin: f.cabin, maxStops: f.maxStops, alliance: f.alliance, airlines: f.airlines,
    adults: f.adults, children: f.children, infantsSeat: f.infantsSeat, infantsLap: f.infantsLap, bags: f.bags, maxHours: f.maxHours === '' ? null : Number(f.maxHours), sort: f.sort,
  };
  let raw;
  if (f.trip === 'mc') {
    const segs = [];
    for (let i = 0; i < f.segs.length; i++) {
      const o = place(f.segs[i].o, `seg.${i}.o`);
      if (o.error) return o;
      const d = place(f.segs[i].d, `seg.${i}.d`);
      if (d.error) return d;
      segs.push({ o: o.value, d: d.value, date: f.segs[i].date });
    }
    raw = { trip: 'mc', segs, ...filters };
  } else {
    const o = place(f.o, 'o');
    if (o.error) return o;
    const d = place(f.d, 'd');
    if (d.error) return d;
    raw = { trip: f.trip, o: o.value, d: d.value, depart: f.depart, return: f.trip === 'rt' ? f.return : null, ...filters };
  }
  const { search, error } = normalizeSearch(raw);
  if (!error && today && routeSegments(search)[0].date < today) return { error: 'past', field: f.trip === 'mc' ? 'seg.0.date' : 'depart' };
  if (error) {
    const field = { depart: f.trip === 'mc' ? 'seg.0.date' : 'depart', return: 'return', 'return-before-depart': 'return', 'segment-order': 'segs', segments: 'segs', 'same-airport': f.trip === 'mc' ? 'segs' : 'd', 'blocked-airline': 'airlines' }[error] || 'form';
    return { error, field };
  }
  return { search };
}

/** The tracker a form describes, or { error } — same checks the server applies, plus "all dates are in the past". */
export function trackerFromForm(f, { today, id, created }) {
  const built = buildSearch(f, { today });
  if (built.error) return built;
  const s = built.search;
  const flex = f.mode === 'flex' ? Number(f.flex) : 0;
  const raw = {
    ...s,
    id: id || f.id || undefined,
    created: created || f.created || today,
    mode: flex > 0 ? 'flex' : 'fixed',
    flex,
    target: f.target ? Number(f.target) : null,
    alertOn: f.alertOn,
    notify: f.notify,
    label: f.label,
    pos: !!f.pos,
  };
  const { tracker, error } = normalizeTracker(raw);
  if (error) return { error, field: 'form' };
  if (!trackerCombos(tracker, today).length) return { error: 'past', field: 'depart' };
  return { tracker };
}

/** Daily cost of the tracking options: SerpApi searches per day (one more when comparing countries) and days to see every date. */
export function trackCost(f) {
  const shape = { mode: f.mode === 'flex' ? 'flex' : 'fixed', flex: f.mode === 'flex' ? Number(f.flex) : 0, trip: f.trip };
  const perDay = searchesPerDay(shape);
  const combos = comboCount(shape);
  const days = shape.mode === 'flex' ? Math.max(1, Math.ceil((combos - 1) / Math.max(1, FLEX_SEARCHES_PER_DAY - 1))) : 1;
  return { perDay: perDay + (f.pos ? 1 : 0), combos, days };
}

/** SerpApi searches a live search costs: 1, plus the legs after the first of each verified option. */
export function searchCost(legs, verify) {
  return 1 + (legs > 1 ? verify * (legs - 1) : 0);
}

/** How many options the server should complete: as many as fit in its 5-search budget, at most 2. */
export function verifyCount(legs) {
  return legs <= 1 ? 0 : Math.max(1, Math.min(2, Math.floor(4 / (legs - 1))));
}

const durationOf = (d) => (d.legs || []).reduce((n, l) => n + (l.durationMin || 0), 0);
const departOf = (d) => String(d.legs?.[0]?.segments?.[0]?.dep || d.departDate || '');

export const RESULT_SORTS = ['price', 'duration', 'stops', 'depart'];

export function sortDeals(list, key) {
  const by = {
    price: (a, b) => a.priceTWD - b.priceTWD,
    duration: (a, b) => (durationOf(a) || Infinity) - (durationOf(b) || Infinity) || a.priceTWD - b.priceTWD,
    stops: (a, b) => (a.stops ?? 9) - (b.stops ?? 9) || a.priceTWD - b.priceTWD,
    depart: (a, b) => departOf(a).localeCompare(departOf(b)) || a.priceTWD - b.priceTWD,
  }[key] || ((a, b) => a.priceTWD - b.priceTWD);
  return [...list].sort(by);
}

/** Alliance chips list and the airlines they stand for, e.g. for a "Star Alliance + EVA" hint. */
export const allianceChoices = [null, ...ALLIANCE_KEYS];

/** The airports a form field resolves to, as a flat list (for hints and the shareable link). */
export const codesOf = (text) => {
  const r = resolvePlaces(text);
  return r.codes || [];
};

/** A target price a bit under what a result costs now — the default when tracking from a result. */
export const suggestTarget = (priceTWD) => Math.max(1000, Math.floor((priceTWD * 0.95) / 100) * 100);

export { placeList, routeSegments, MAX_PAX };
