// Community deals, promotions and pasted posts as plain data: filtering, ordering, and turning a post into a search.
// No DOM and no translated text here, so the rules can be tested in Node.
import { mentionsChina } from '../core/community.js';
import { relatedToWallet, usableFromTaiwan } from '../core/promos.js';
import { routeToSearch } from '../core/community.js';
import { shiftDate } from '../core/search.js';

export const MIN_RELEVANCE = 35; // "與我相關": below this a post is about somewhere far from a Taiwan-based flyer
export const DEAL_KIND_ORDER = ['error-fare', 'ex-station', 'multi-city', 'interline', 'stopover', 'hidden-city', 'sale'];
export const PROMO_KIND_ORDER = ['status-match', 'fare-sale', 'route-promo', 'bonus-miles', 'award-sale'];
export const PROMO_CATEGORIES = ['airline', 'hotel', 'cruise', 'car'];

const DAY = 86400000;
export const daysUntil = (iso, today) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);

/** Defence in depth: the scanner already drops China / Hong Kong / Macau posts; this re-checks what the browser received. */
export function chinaFree(items) {
  const clean = items.filter((x) => !mentionsChina(`${x.title} ${x.summary || ''}`));
  return { clean, dropped: items.length - clean.length };
}

const byRelevance = (a, b) => b.relevance - a.relevance || String(b.published).localeCompare(String(a.published));

/**
 * @param {object[]} deals community.json deals
 * @param {{ rel: 'mine'|'all'|'saved', kind: string, cabin?: string }} f
 * @param {{ saved: Set<string>, hidden: Set<string> }} marks
 */
export function filterDeals(deals, f, marks) {
  return deals
    .filter((d) => !marks.hidden.has(d.id))
    .filter((d) => (f.rel === 'saved' ? marks.saved.has(d.id) : f.rel === 'all' || d.relevance >= MIN_RELEVANCE))
    .filter((d) => f.kind === 'all' || d.kinds.includes(f.kind))
    .filter((d) => !f.cabin || f.cabin === 'all' || d.cabin === f.cabin || d.cabin === 'first')
    .sort(byRelevance);
}

export function kindCounts(deals, order = DEAL_KIND_ORDER) {
  const n = Object.fromEntries(order.map((k) => [k, 0]));
  for (const d of deals) for (const k of d.kinds) if (k in n) n[k] += 1;
  return n;
}

/** Promotions, best first: the ones about programs you hold, then by relevance; locked-to-another-country ones only when asked for. */
export function filterPromos(promos, f, { members = [], today, saved = new Set(), hidden = new Set() } = {}) {
  const rows = promos
    .filter((p) => !hidden.has(p.id))
    .filter((p) => !p.validTo || !today || p.validTo >= today)
    .map((p) => ({ p, mine: relatedToWallet(p, members) }));
  return rows
    .filter(({ p, mine }) => {
      if (f.rel === 'saved') return saved.has(p.id);
      if (f.rel === 'wallet') return mine.length > 0;
      if (f.rel === 'mine') return p.relevance >= 40 && usableFromTaiwan(p.lock || []);
      return true;
    })
    .filter(({ p }) => f.kind === 'all' || p.kinds.includes(f.kind))
    .filter(({ p }) => f.cat === 'all' || p.category === f.cat)
    .sort((a, b) => score(b, today) - score(a, today) || String(b.p.published).localeCompare(String(a.p.published)));
}

const score = ({ p, mine }, today) => p.relevance + (mine.length ? 30 : 0) + (p.validTo && today && daysUntil(p.validTo, today) <= 3 ? 5 : 0);

/** How long a promotion has left: { days, tone } — tone 'urgent' (≤ 3 days), 'soon' (≤ 14), or 'plenty'. */
export function deadline(p, today) {
  if (!p.validTo || !today) return null;
  const days = daysUntil(p.validTo, today);
  if (days < 0) return null;
  return { days, date: p.validTo, tone: days <= 3 ? 'urgent' : days <= 14 ? 'soon' : 'plenty' };
}

/** Search-form fields for a feed deal: the airports its title names (a country or region leaves that side empty). */
export function dealSearchFields(d) {
  const o = d.route?.o?.kind === 'place' ? d.route.o.code : '';
  const dest = d.route?.d?.kind === 'place' ? d.route.d.code : '';
  if (!o && !dest) return null;
  return { trip: d.price?.rt === false ? 'ow' : 'rt', o, d: dest, cabin: d.cabin && d.cabin !== 'economy' ? d.cabin : 'business' };
}

// ───────────────────────── pasted posts ─────────────────────────

/**
 * A parsed route plus the airports chosen for its country / region stops → search-form fields.
 * @param {object} route one entry of parsePost(...).routes
 * @param {Record<number, string>} picks node index → airport code
 * @returns {{ fields: object, missing: number[] }} `missing` = indexes of stops that still need an airport
 */
export function routeFields(route, picks = {}, { today } = {}) {
  const rs = routeToSearch(route);
  const missing = rs.wild.filter((w) => !picks[w.node]).map((w) => w.node);
  const code = (nodeIdx, fallback) => picks[nodeIdx] || fallback || '';
  const legs = rs.bind.map(([a, b], i) => {
    const base = rs.trip === 'mc' ? rs.segs[i] : { o: i === 0 ? rs.o : rs.d, d: i === 0 ? rs.d : rs.o };
    return { o: code(a, base.o), d: code(b, base.d) };
  });
  const start = today ? shiftDate(today, 60) : '';
  const dated = (i) => (start ? shiftDate(start, 4 * i) : '');
  if (rs.trip === 'mc') return { fields: { trip: 'mc', o: legs[0].o, d: legs[0].d, depart: dated(0), segs: legs.map((l, i) => ({ ...l, date: dated(i) })) }, missing };
  if (rs.trip === 'rt') return { fields: { trip: 'rt', o: legs[0].o, d: legs[0].d, depart: dated(0), return: start ? shiftDate(start, 7) : '' }, missing };
  return { fields: { trip: 'ow', o: legs[0].o, d: legs[0].d, depart: dated(0) }, missing };
}

/** Stops of a parsed route for display, in order: [{ idx, code, kind, text, gap }]. */
export const routeNodes = (route) => route.nodes;

/** Local marks (saved / hidden posts) survive reloads on this device only. */
export function readMarks(raw) {
  const list = (v, n) => new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(-n) : []);
  try {
    const v = JSON.parse(raw || '{}');
    return { saved: list(v.saved, 300), hidden: list(v.hidden, 500), seen: list(v.seen, 600) };
  } catch {
    return { saved: new Set(), hidden: new Set(), seen: new Set() };
  }
}

export const writeMarks = (m) => JSON.stringify({ saved: [...m.saved].slice(-300), hidden: [...m.hidden].slice(-500), seen: [...(m.seen || [])].slice(-600) });

// ───────────────────────── what is worth interrupting for ─────────────────────────

/**
 * New items (first seen in the latest scan) strong enough to tell someone about — the same bar as the daily e-mail / push digest
 * (scripts/community-notify.mjs): strong deals, strong or Taiwan-usable promotions, and anything about a program you hold.
 * @returns {{ deals: object[], promos: object[], mine: object[] }}
 */
export function pickAlerts(data, { members = [], seen = new Set(), saved = new Set(), hidden = new Set() } = {}) {
  if (!data || data.missing) return { deals: [], promos: [], mine: [] };
  const fresh = (x) => x.firstSeen === data.scanDate && !seen.has(x.id) && !hidden.has(x.id);
  const deals = data.deals.filter(fresh).filter((d) => d.relevance >= 60 || (d.kinds.includes('error-fare') && d.relevance >= 45));
  const promos = data.promos.filter(fresh).filter((p) => usableFromTaiwan(p.lock || []));
  const mine = promos.filter((p) => relatedToWallet(p, members).length);
  const strong = promos.filter((p) => !mine.includes(p) && (p.relevance >= 55 || (p.kinds.includes('status-match') && p.relevance >= 45)));
  return { deals: deals.slice(0, 4), promos: strong.slice(0, 4), mine: mine.slice(0, 4) };
}

/** Saved promotions that end within `days` days (and have not been mentioned yet): worth a reminder before they are gone. */
export function pickExpiring(data, { saved = new Set(), seen = new Set(), today, days = 3 } = {}) {
  if (!data || data.missing || !today) return [];
  return data.promos.filter((p) => saved.has(p.id) && p.validTo && !seen.has(`exp:${p.id}`) && daysUntil(p.validTo, today) >= 0 && daysUntil(p.validTo, today) <= days);
}
