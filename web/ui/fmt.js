// Number / date / name formatting shared by every screen. app.js binds the live preferences once at start-up;
// until then (and in tests) money is shown in TWD.
import { t, getLang } from '../i18n.js';
import { airportCity } from '../core/airports.js';
import { airlineName } from '../core/airlines.js';

const source = { rates: () => null, currency: () => 'TWD' };
/** @param {{ rates?: () => object|null, currency?: () => string }} s */
export const bindFormat = (s) => Object.assign(source, s);

export const SYM = { TWD: 'NT$', USD: 'US$', KRW: '₩', JPY: '¥', EUR: '€', THB: '฿', VND: '₫', SGD: 'S$', PHP: '₱', MYR: 'RM', GBP: '£', AUD: 'A$', IDR: 'Rp', INR: '₹' };

export const locale = () => ({ 'zh-TW': 'zh-TW', en: 'en-US', ko: 'ko-KR' })[getLang()] || 'zh-TW';

export function rate(cur) {
  if (cur === 'TWD') return 1;
  return source.rates()?.[cur] || null;
}

/** TWD amount shown in the viewer's currency (falls back to TWD when the rate is unknown). */
export function money(twd, cur = source.currency()) {
  if (twd == null || !Number.isFinite(twd)) return '—';
  let c = cur;
  let r = rate(c);
  if (!r) {
    c = 'TWD';
    r = 1;
  }
  return (SYM[c] || `${c} `) + Math.round(twd * r).toLocaleString(locale());
}

export function moneyPerKm(twdPerKm, bare = false) {
  if (twdPerKm == null) return '';
  let c = source.currency();
  let r = rate(c);
  if (!r) {
    c = 'TWD';
    r = 1;
  }
  const v = twdPerKm * r;
  const digits = v < 1 ? 3 : v < 10 ? 2 : v < 100 ? 1 : 0;
  const out = (SYM[c] || c) + v.toFixed(digits);
  return bare ? out : t('perKm', { v: out });
}

/** An amount in its own currency ("USD 563"). */
export const localMoney = (amount, cur) => `${cur} ${Math.round(amount).toLocaleString(locale())}`;

export function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' }).format(d);
}

/** With the year — for dates that may be a year away (deadlines, trip dates in a shared link). */
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }).format(d);
}

export function fmtDur(min) {
  if (!Number.isFinite(min)) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m ? String(m).padStart(2, '0') + 'm' : ''}`;
}

export const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const hhmm = (s) => (s ? String(s).slice(11, 16) : '');
export const dayDiff = (a, b) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
export const city = (code) => airportCity(code, getLang());
export const carrierLabel = (code) => airlineName(code, getLang());
export const cap = (k) => k[0].toUpperCase() + k.slice(1);
export const todayTpe = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
