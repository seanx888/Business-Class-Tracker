// Business Class Radar — PWA front-end (vanilla ES modules, no build step).
// Layout follows design-system/business-class-tracker/pages/app.md (Minimal Swiss, SVG icons, hash routes).
import { t, setLang, getLang, LANGS, regionName, countryName } from './i18n.js';
import { ALLIANCES, ALLIANCE_ORDER, BLOCKED_CARRIERS, AIRLINES, airlineName } from './core/airlines.js';
import { AIRPORTS, airportCity } from './core/airports.js';
import { rankDeals } from './core/scoring.js';
import { isChinaFree } from './core/exclusion.js';
import { searchLinks, airlineUrl, googleFlightsUrl } from './core/links.js';
import { icon } from './icons.js';

// ───────────────────────── prefs (per-device) ─────────────────────────
const PREF_KEY = 'bct.prefs.v1';
// carrierType: 'fsc' (full-service, default) · 'lcc' (low-cost carriers) · 'all'
const DEFAULT_FILTERS = { carrierType: 'fsc', origin: 'all', region: 'all', alliance: 'all', nonstop: false, flat: false, minTier: 'all', sort: 'score' };

function loadPrefs() {
  const base = { lang: 'zh-TW', langChosen: false, currency: 'TWD', theme: 'auto', skyteamBoost: 'standard', positioning: {}, targets: {}, notified: {}, lastScan: null, filters: { ...DEFAULT_FILTERS } };
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    const p = { ...base, ...saved, filters: { ...DEFAULT_FILTERS, ...(saved.filters || {}) } };
    // Always open in Traditional Chinese unless someone explicitly picked another language in Settings.
    if (!p.langChosen) p.lang = 'zh-TW';
    return p;
  } catch {
    return base;
  }
}
const prefs = loadPrefs();
function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode — preferences just won't persist */
  }
}

// ───────────────────────── state ─────────────────────────
const TABS = ['deals', 'special', 'routes', 'settings'];
const state = { data: null, deals: [], history: null, tab: 'deals', special: 'ex', error: null, dropped: 0, limit: 40, installEvt: null, exOpen: new Set(), filtersOpen: false };

// ───────────────────────── helpers ─────────────────────────
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const locale = () => ({ 'zh-TW': 'zh-TW', en: 'en-US', ko: 'ko-KR' })[getLang()] || 'zh-TW';
const SYM = { TWD: 'NT$', USD: 'US$', KRW: '₩', JPY: '¥', EUR: '€', THB: '฿', VND: '₫', SGD: 'S$', PHP: '₱', MYR: 'RM', GBP: '£', AUD: 'A$', IDR: 'Rp', INR: '₹' };
const TIER_ORDER = ['hot', 'great', 'good', 'fair'];
const TIER_ICON = { hot: 'fire', great: 'thumbs-up', good: 'check' };
const ext = () => icon('arrow-square-out', { size: 16 });

function rate(cur) {
  if (cur === 'TWD') return 1;
  return state.data?.fx?.rates?.[cur] || null;
}
function money(twd, cur = prefs.currency) {
  if (twd == null || !Number.isFinite(twd)) return '—';
  let c = cur;
  let r = rate(c);
  if (!r) {
    c = 'TWD';
    r = 1;
  }
  return (SYM[c] || `${c} `) + Math.round(twd * r).toLocaleString(locale());
}
function moneyPerKm(twdPerKm, bare = false) {
  if (twdPerKm == null) return '';
  let c = prefs.currency;
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
const localMoney = (amount, cur) => `${cur} ${Math.round(amount).toLocaleString(locale())}`;
function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' }).format(d);
}
function fmtDur(min) {
  if (!Number.isFinite(min)) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m ? String(m).padStart(2, '0') + 'm' : ''}`;
}
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const hhmm = (s) => (s ? String(s).slice(11, 16) : '');
const dayDiff = (a, b) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
const city = (code) => airportCity(code, getLang());
const carrierLabel = (code) => airlineName(code, getLang());
const cap = (k) => k[0].toUpperCase() + k.slice(1);

function toast(msg, ms = 3500) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), ms);
}

function applyTheme() {
  if (prefs.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = prefs.theme;
}

// ───────────────────────── routing (hash, so Back works and tabs are linkable) ─────────────────────────
function readHash() {
  const [tab, sub] = location.hash.replace(/^#\/?/, '').split('/');
  state.tab = TABS.includes(tab) ? tab : 'deals';
  if (state.tab === 'special') state.special = sub === 'pos' ? 'pos' : 'ex';
}
function go(hash) {
  if (location.hash === hash) return render();
  location.hash = hash; // → hashchange → render
}
window.addEventListener('hashchange', () => {
  readHash();
  render();
  window.scrollTo({ top: 0 });
});

// ───────────────────────── data ─────────────────────────
// Fare data is committed daily to GitHub by the scanner. Reading it straight from the public repo
// means the hosted app (Vercel) shows new fares without being redeployed.
// Falls back to the copy bundled with the deployment (and to local files during development).
const LOCAL_DEV = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const REMOTE_DATA = LOCAL_DEV ? null : document.querySelector('meta[name="bct-data-url"]')?.content || null;
const DATA_BASES = REMOTE_DATA ? [REMOTE_DATA, 'data/'] : ['data/'];

async function fetchData(file, force) {
  let lastErr;
  for (const base of DATA_BASES) {
    try {
      const res = await fetch(`${base}${file}${force ? `?t=${Date.now()}` : ''}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function loadData(force = false) {
  $('#refresh-btn').classList.add('spin');
  try {
    const data = await fetchData('deals.json', force);
    // Defence in depth: re-verify every published deal against the exclusion rules in this browser.
    const clean = (data.deals || []).filter((d) => isChinaFree(d));
    state.dropped = (data.deals || []).length - clean.length;
    state.data = data;
    state.deals = clean;
    state.error = null;
    if (state.history) state.history = null; // refresh lazily
  } catch (e) {
    state.error = e.message;
  }
  $('#refresh-btn').classList.remove('spin');
  render();
  checkAlerts();
}

async function loadHistory() {
  if (state.history) return;
  try {
    state.history = await fetchData('history.json');
  } catch {
    state.history = { routes: {} };
  }
  if (state.tab === 'routes') renderRoutes();
}

// LCC fares are kept apart: full-service is the default view, LCC / all are one tap away.
const isLcc = (d) => !!d.budget;
function matchesCarrierType(d, type = prefs.filters.carrierType) {
  if (type === 'all') return true;
  return type === 'lcc' ? isLcc(d) : !isLcc(d);
}
function visibleDeals() {
  return state.deals.filter((d) => matchesCarrierType(d));
}
function historyFor(key) {
  const h = state.history || {};
  const fsc = h.routes?.[key] || [];
  const lcc = h.lcc?.[key] || [];
  const type = prefs.filters.carrierType;
  if (type === 'fsc') return fsc;
  if (type === 'lcc') return lcc;
  const byDate = new Map();
  for (const e of [...fsc, ...lcc]) {
    const x = byDate.get(e[0]);
    if (!x || e[1] < x[1]) byDate.set(e[0], e);
  }
  return [...byDate.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

function filteredDeals() {
  const f = prefs.filters;
  let list = visibleDeals().filter((d) => {
    if (f.origin === 'home' && d.originType !== 'home') return false;
    if (f.origin === 'ex' && d.originType !== 'exstation') return false;
    if (f.region !== 'all' && d.region !== f.region) return false;
    if (f.alliance !== 'all' && d.alliance !== f.alliance) return false;
    if (f.nonstop && d.stops !== 0) return false;
    if (f.flat && d.lieFlat !== true) return false;
    return true;
  });
  list = rankDeals(list, f.sort, { skyteamBoost: prefs.skyteamBoost });
  if (f.minTier !== 'all') {
    const max = TIER_ORDER.indexOf(f.minTier);
    list = list.filter((d) => TIER_ORDER.indexOf(d._tier) <= max);
  }
  return list;
}
function activeFilterCount() {
  const f = prefs.filters;
  return [f.region !== 'all', f.alliance !== 'all', f.nonstop, f.flat, f.minTier !== 'all'].filter(Boolean).length;
}

// ───────────────────────── rendering: shared ─────────────────────────
function render() {
  setLang(prefs.lang);
  document.title = `${t('appName')} · ${t('appSub')}`;
  $('#app-name').textContent = t('appName');
  $('#app-sub').textContent = t('appSub');
  $('#refresh-btn').setAttribute('aria-label', t('refresh'));
  $('#install-btn').setAttribute('aria-label', t('install'));
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll('.tabbar button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'));
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== `view-${state.tab}`));
  renderBanner();
  ({ deals: renderDeals, special: renderSpecial, routes: renderRoutes, settings: renderSettings })[state.tab]();
}

function notice(text, warn = false) {
  return `<div class="notice${warn ? ' warn' : ''}">${icon(warn ? 'warning' : 'info')}<span>${esc(text)}</span></div>`;
}

function renderBanner() {
  const msgs = [];
  if (state.data?.isDemo) msgs.push(notice(t('demoBanner')));
  if (!navigator.onLine) msgs.push(notice(t('offline'), true));
  if (state.dropped) msgs.push(notice(t('dropped', { n: state.dropped }), true));
  $('#banner').innerHTML = msgs.join('');
}

function skeleton() {
  return `<div class="skeleton"></div><div class="skeleton"></div>`;
}

function logo(code) {
  // Carrier code shows through if the logo image fails to load.
  return `<span class="logo-wrap"><span class="logo-code">${esc(code)}</span><img class="logo" src="https://www.gstatic.com/flights/airline_logos/70px/${esc(code)}.png" alt="" loading="lazy"></span>`;
}

const allianceName = (a) => (a === 'NONE' ? t('noAlliance') : ALLIANCES[a]?.name || a);
function allianceMark(a) {
  return `<span class="al al-${esc(a)}">${esc(allianceName(a))}</span>`;
}

function segmented(act, options, current, label) {
  return `<div class="segmented" role="group" aria-label="${esc(label)}">${options
    .map(([v, text]) => `<button data-act="${act}" data-v="${esc(v)}" aria-pressed="${current === v}">${esc(text)}</button>`)
    .join('')}</div>`;
}
function chip(act, value, label, pressed, extraClass = '') {
  return `<button class="chip ${extraClass}" data-act="${act}" data-v="${esc(value)}" aria-pressed="${pressed}">${label}</button>`;
}
function carrierChips() {
  const c = prefs.filters.carrierType;
  return `<div class="chips" role="group" aria-label="${esc(t('carrierAll'))}">${chip('f-carrier', 'fsc', esc(t('carrierFsc')), c === 'fsc')}${chip('f-carrier', 'lcc', esc(t('carrierLcc')), c === 'lcc')}${chip('f-carrier', 'all', esc(t('carrierAll')), c === 'all')}</div>`;
}

function stopsText(d) {
  const leg = d.legs?.[0];
  const dur = fmtDur(leg?.durationMin);
  if (d.stops === 0) return `${t('nonstop')}${dur ? ' · ' + dur : ''}`;
  const via = (d.via || []).join(', ');
  return `${t('stops', { n: d.stops })}${via ? ' · ' + t('via', { v: via }) : ''}`;
}
function tripText(d) {
  if (!d.returnDate) return `${fmtDay(d.departDate)} · ${t('ow')}`;
  return `${fmtDay(d.departDate)} – ${fmtDay(d.returnDate)} · ${t('days', { n: dayDiff(d.departDate, d.returnDate) })}`;
}

function tag(text, cls = '', ic = '') {
  return `<span class="tag ${cls}">${ic ? icon(ic, { size: 14 }) : ''}${esc(text)}</span>`;
}
function dealTags(d) {
  const b = [];
  if (d._errorFare) b.push(tag(t('errorFare'), 'hot', 'lightning'));
  if (d.pos?.best) b.push(tag(t('posBadge', { c: countryName(d.pos.best.country), p: Math.round(d.pos.best.savingsPct) }), 'pos', 'globe-hemisphere-east'));
  if (d.label) b.push(tag(d.label, 'pos', 'target'));
  if (d.viaHome && d.originType === 'exstation') b.push(tag(t('viaHome'), 'good', 'star'));
  if (d.lieFlat === true) b.push(tag(t('lieFlat'), '', 'bed'));
  if (d.lieFlat === false) b.push(tag(t('recliner'), 'warn'));
  if (d.budget) b.push(tag(t('budget'), '', 'seat'));
  if (d.mixedCabin) b.push(tag(t('mixedCabin'), 'warn'));
  if (d.overnightLayover) b.push(tag(t('overnight'), 'warn', 'moon'));
  else if (d.longestLayoverMin > 480) b.push(tag(t('longLayover'), 'warn', 'clock'));
  if (d.ageDays > 0) b.push(tag(t('seen', { n: d.ageDays })));
  return b.length ? `<div class="tags">${b.join('')}</div>` : '';
}

function scorePill(d) {
  const ic = TIER_ICON[d._tier];
  return `<span class="score t-${d._tier}" title="${esc(t('score'))} ${d._score}">${ic ? icon(ic, { size: 14 }) : ''}${esc(t('tier_' + d._tier))} ${d._score}</span>`;
}

function dealCard(d) {
  const disc = d._discount;
  const delta = disc == null ? '' : disc > 0
    ? `<div class="delta">${esc(t('vsTypical', { p: disc }))}</div>`
    : `<div class="delta up">${esc(t('aboveTypical', { p: Math.abs(disc) }))}</div>`;
  return `
  <article class="deal${d._tier === 'hot' || d._errorFare ? ' is-hot' : ''}" id="deal-${esc(d.id)}">
    <button class="deal-main" data-act="toggle" data-id="${esc(d.id)}" aria-expanded="false">
      <div class="deal-head">
        <span class="carrier">${logo(d.primaryCarrier)}<b>${esc(carrierLabel(d.primaryCarrier))}</b></span>
        ${allianceMark(d.alliance)}
        ${scorePill(d)}
      </div>
      <div class="deal-body">
        <div class="route">${esc(d.origin)}${icon('arrow-right', { size: 16 })}${esc(d.destination)}</div>
        <div class="price">${money(d.priceTWD)}</div>
        <div class="cities">${esc(city(d.origin))} – ${esc(city(d.destination))}</div>
        ${delta}
      </div>
      <div class="meta">${esc(tripText(d))} · ${esc(stopsText(d))}</div>
      ${dealTags(d)}
    </button>
    <div class="deal-detail" hidden></div>
  </article>`;
}

function legHtml(leg, title, date) {
  const parts = [];
  leg.segments.forEach((s, i) => {
    const plus = s.dep && s.arr ? dayDiff(s.dep, s.arr) : 0;
    const op = s.operatingName && !String(s.operatingName).toLowerCase().includes(String(s.carrierName || carrierLabel(s.carrier)).toLowerCase())
      ? ` · ${esc(t('operatedBy', { v: s.operatingName }))}` : '';
    const flat = s.lieFlat === true ? ` · ${t('lieFlat')}` : s.lieFlat === false ? ` · ${t('recliner')}` : '';
    parts.push(`<li class="seg">
      <div class="t">${esc(hhmm(s.dep))} ${esc(s.from)} – ${esc(hhmm(s.arr))}${plus > 0 ? `<sup>+${plus}</sup>` : ''} ${esc(s.to)} <span class="muted small">${esc(city(s.to))}</span></div>
      <div class="m">${esc(s.flightNumber || s.carrier)} · ${esc(carrierLabel(s.carrier))}${s.aircraft ? ' · ' + esc(s.aircraft) : ''}${flat} · ${fmtDur(s.durationMin)}${op}</div>
    </li>`);
    const l = leg.layovers?.[i];
    if (l && i < leg.segments.length - 1) {
      const long = l.durationMin > 480 || l.overnight;
      parts.push(`<li class="lay${long ? ' warn' : ''}">${icon(l.overnight ? 'moon' : 'clock', { size: 14 })}${esc(t('layover', { a: `${l.airport} ${city(l.airport)}`, d: fmtDur(l.durationMin) }))}</li>`);
    }
  });
  return `<div class="sec"><h4>${esc(title)} · ${fmtDay(date)}</h4><ol class="timeline">${parts.join('')}</ol></div>`;
}

function posMarketUrl(d, m) {
  return googleFlightsUrl({ origin: d.origin, destination: d.destination, departDate: d.departDate, returnDate: d.returnDate, currency: m.currency, lang: getLang(), gl: m.country });
}

function posRows(d) {
  const home = { country: 'TW', currency: d.currency || 'TWD', price: d.price ?? d.priceTWD, priceTWD: d.priceTWD, savingsTWD: 0, savingsPct: 0, home: true };
  const rows = [home, ...(d.pos?.markets || [])].sort((a, b) => a.priceTWD - b.priceTWD);
  return `<div class="pos-list">${rows.map((m) => {
    const val = m.home ? '' : m.savingsPct >= 1
      ? `<small class="save">${esc(t('posSave', { v: money(m.savingsTWD) }))}</small>`
      : m.savingsPct <= -1 ? `<small class="more">${esc(t('posMore', { p: Math.round(-m.savingsPct) }))}</small>` : `<small class="more">${esc(t('posSame'))}</small>`;
    const sub = `${localMoney(m.price, m.currency)}${m.match === 'carrier' ? ` · ${t('posViaCarrier')}` : ''}`;
    return `<a class="pos-row" href="${esc(posMarketUrl(d, m))}" target="_blank" rel="noopener">
      <span class="cc">${esc(m.country)}</span>
      <span class="who">${esc(m.home ? t('posHome') : t('posMarket', { c: countryName(m.country) }))}<small>${esc(sub)}</small></span>
      <span class="val">${money(m.priceTWD)}${val}</span>
    </a>`;
  }).join('')}</div>`;
}

function caveats(open = false) {
  return `<details class="caveats"${open ? ' open' : ''}><summary>${icon('info', { size: 16 })}${esc(t('posCaveatsTitle'))}</summary><ul>${t('posCaveats').map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
}

function dealDetail(d) {
  const secs = [legHtml(d.legs[0], t('outbound'), d.departDate)];
  if (d.legs[1]) secs.push(legHtml(d.legs[1], t('inbound'), d.returnDate));
  else if (d.returnDate) secs.push(`<p class="small muted">${esc(t('inboundUnknown'))}</p>`);
  secs.push(`<div class="verify">${icon('shield-check', { size: 16 })}${esc(d.inboundVerified ? t('verifiedFull') : t('verifiedOut'))}</div>`);

  const r = d.reference;
  const kv = [];
  if (r) kv.push([t('ref_' + r.source), `${money(r.value)}${r.low && r.high ? ` (${money(r.low)}–${money(r.high)})` : ''}`]);
  if (d.priceLevel) {
    const lvl = t('lvl_' + d.priceLevel);
    kv.push([t('googleLevel'), esc(lvl.startsWith('lvl_') ? d.priceLevel : lvl)]);
  }
  kv.push([t('score'), `${d._score} · ${esc(t('tier_' + d._tier))}`]);
  if (d._cpk != null) kv.push([t('perKmLbl'), esc(moneyPerKm(d._cpk, true))]);
  if (d.price && d.currency && d.currency !== 'TWD') kv.push([d.currency, localMoney(d.price, d.currency)]);
  secs.push(`<div class="sec"><h4>${esc(t('priceRef'))}</h4><div class="kv">${kv.map(([k, v]) => `<span>${esc(k)}</span><span>${v}</span>`).join('')}</div></div>`);

  if (d.pos?.markets?.length) {
    secs.push(`<div class="sec"><h4>${esc(t('posSection'))}${state.data?.isDemo ? ` · ${esc(t('posDemo'))}` : ''}</h4>${posRows(d)}${caveats()}</div>`);
  }

  const links = searchLinks({ origin: d.origin, destination: d.destination, departDate: d.departDate, returnDate: d.returnDate, currency: 'TWD', lang: getLang() });
  const site = airlineUrl(d.primaryCarrier);
  const [google, ...others] = links;
  secs.push(`<div class="actions">
      <a class="btn primary block" href="${esc(google.url)}" target="_blank" rel="noopener">${esc(t('openGoogle'))}${ext()}</a>
      <div class="row">
        ${others.map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}
        ${site ? `<a class="btn" href="${esc(site)}" target="_blank" rel="noopener">${esc(t('airlineSite'))}</a>` : ''}
      </div>
      <button class="btn quiet" data-act="target" data-route="${esc(d.routeKey)}">${icon('target', { size: 16 })}${esc(t('setAlert'))}</button>
    </div>`);
  return secs.join('');
}

// ───────────────────────── Deals tab ─────────────────────────
function renderDeals() {
  const el = $('#view-deals');
  if (!state.data) {
    el.innerHTML = state.error ? `<div class="empty">${esc(t('loadFail'))} (${esc(state.error)})</div>` : skeleton();
    return;
  }
  const d = state.data;
  const f = prefs.filters;
  const ranked = rankDeals(visibleDeals(), 'score', { skyteamBoost: prefs.skyteamBoost });
  const hiddenLcc = f.carrierType === 'fsc' ? state.deals.filter(isLcc).length : 0;
  const top = ranked[0];
  const greatCount = ranked.filter((x) => x._tier === 'hot' || x._tier === 'great').length;
  const regions = ['JP', 'KR', 'SEA', 'SAS', 'OC', 'EU', 'NA', 'ME', 'LATAM', 'AF', 'CAS', 'TW', 'OTHER'].filter((r) => visibleDeals().some((x) => x.region === r));
  const list = filteredDeals();
  const nFilters = activeFilterCount();

  el.innerHTML = `
    <div class="status">${icon('shield-check', { size: 16 })}<span>${esc(t('status', { n: d.stats?.excluded?.china ?? 0, t: fmtWhen(d.generatedAt) }))}</span></div>
    <button class="hero" data-act="jump" data-id="${esc(top?.id || '')}" ${top ? '' : 'disabled'}>
      <span class="label">${esc(t('bestToday'))}</span>
      <span>
        <span class="big num">${top ? money(top.priceTWD) : '—'}</span>
        <span class="sub">${top ? `${esc(top.origin)} – ${esc(top.destination)} · ${esc(city(top.destination))} · ${esc(carrierLabel(top.primaryCarrier))}` : ''}</span>
      </span>
      <span class="kpis"><b class="num">${greatCount}</b> ${esc(t('kpiGreat'))}<br><b class="num">${d.routes?.length ?? 0}</b> ${esc(t('kpiRoutes'))}</span>
    </button>
    ${segmented('f-carrier', [['fsc', t('carrierFsc')], ['lcc', t('carrierLcc')], ['all', t('carrierAll')]], f.carrierType, t('carrierAll'))}
    <div class="toolbar">
      <select data-f="origin" aria-label="${esc(t('originAll'))}">
        ${[['all', t('originAll')], ['home', t('originHome')], ['ex', t('originEx')]].map(([v, l]) => `<option value="${v}" ${f.origin === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
      <select data-f="sort" aria-label="${esc(t('sort'))}">
        ${['score', 'price', 'discount', 'alliance', 'cpk', 'date'].map((k) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${esc(t('sort' + cap(k)))}</option>`).join('')}
      </select>
      <button class="btn" data-act="filters" aria-expanded="${state.filtersOpen}" aria-controls="filter-panel">${icon('sliders-horizontal')}<span>${esc(t('filterBtn'))}</span>${nFilters ? `<span class="count">${nFilters}</span>` : ''}</button>
    </div>
    <div class="filter-panel" id="filter-panel" ${state.filtersOpen ? '' : 'hidden'}>
      <div class="row2">
        <label><span class="field-label">${esc(t('region'))}</span>
          <select data-f="region"><option value="all">${esc(t('allRegions'))}</option>
          ${regions.map((r) => `<option value="${r}" ${f.region === r ? 'selected' : ''}>${esc(regionName(r))}</option>`).join('')}</select></label>
        <label><span class="field-label">${esc(t('minTier'))}</span>
          <select data-f="minTier"><option value="all">${esc(t('allTiers'))}</option>
          ${TIER_ORDER.slice(0, 3).map((k) => `<option value="${k}" ${f.minTier === k ? 'selected' : ''}>${esc(t('tier_' + k))}+</option>`).join('')}</select></label>
      </div>
      <div><span class="field-label">${esc(t('allianceLbl'))}</span>
        <div class="chips">${chip('f-alliance', 'all', esc(t('allAlliances')), f.alliance === 'all')}${ALLIANCE_ORDER.map((a) => chip('f-alliance', a, allianceMark(a), f.alliance === a)).join('')}</div></div>
      <div><span class="field-label">${esc(t('options'))}</span>
        <div class="chips">${chip('f-toggle', 'nonstop', esc(t('nonstopOnly')), f.nonstop)}${chip('f-toggle', 'flat', icon('bed', { size: 16 }) + esc(t('flatOnly')), f.flat)}</div></div>
      <div class="panel-actions">
        ${nFilters ? `<button class="btn quiet" data-act="clear-filters">${esc(t('clearFilters'))}</button>` : ''}
        <button class="btn" data-act="filters">${esc(t('done'))}</button>
      </div>
    </div>
    <div class="resultline">
      <span>${esc(t('resultCount', { n: list.length }))}</span>
      ${hiddenLcc ? `<span>${esc(t('lccHidden', { n: hiddenLcc }))} · <button class="linkish" data-act="f-carrier" data-v="lcc">${esc(t('showLcc'))}</button></span>` : ''}
    </div>
    <div class="list">
      ${list.length ? list.slice(0, state.limit).map(dealCard).join('') : `<div class="empty">${esc(t('noDeals'))}</div>`}
    </div>
    ${list.length > state.limit ? `<div style="text-align:center;margin:16px 0"><button class="btn" data-act="more">+ ${list.length - state.limit}</button></div>` : ''}
  `;
}

// ───────────────────────── Special fares tab: ex-station + foreign-site checkout ─────────────────────────
function positioningCost(o) {
  const v = prefs.positioning[o];
  if (Number.isFinite(v) && v >= 0) return v;
  return state.data?.origins?.[o]?.positioningTWD ?? 0;
}

function renderSpecial() {
  const el = $('#view-special');
  const seg = segmented('special', [['ex', t('specialEx')], ['pos', t('specialPos')]], state.special, t('tabEx'));
  if (!state.data) {
    el.innerHTML = seg + skeleton();
    return;
  }
  el.innerHTML = seg + (state.special === 'pos' ? posHtml() : exHtml());
}

function exHtml() {
  const deals = rankDeals(visibleDeals(), 'price', { skyteamBoost: prefs.skyteamBoost });
  const byDest = new Map();
  for (const d of deals) {
    if (!byDest.has(d.destination)) byDest.set(d.destination, []);
    byDest.get(d.destination).push(d);
  }
  const blocks = [];
  for (const [dest, list] of byDest) {
    const ex = list.filter((d) => d.originType === 'exstation');
    if (!ex.length) continue;
    const home = list.filter((d) => d.originType === 'home');
    const tpeBest = home[0] || null;
    const tpeRoute = state.data.routes?.find((r) => r.d === dest && (state.data.homeAirports || ['TPE']).includes(r.o));
    const baseline = tpeBest ? tpeBest.priceTWD : tpeRoute?.bm?.typical ?? null;
    const bestPerOrigin = new Map();
    for (const d of ex) if (!bestPerOrigin.has(d.origin)) bestPerOrigin.set(d.origin, d);
    const rows = [...bestPerOrigin.values()].map((d) => {
      const pos = positioningCost(d.origin);
      const total = d.priceTWD + pos;
      return { d, pos, total, save: baseline != null ? baseline - total : null };
    }).sort((a, b) => (b.save ?? -Infinity) - (a.save ?? -Infinity) || a.total - b.total);
    blocks.push({ dest, tpeBest, baseline, rows, maxSave: rows[0]?.save ?? -Infinity });
  }
  blocks.sort((a, b) => b.maxSave - a.maxSave);

  return `
    <p class="intro">${esc(t('exIntro'))}</p>
    <p class="small muted">${esc(t('exRules'))}</p>
    ${carrierChips()}
    ${blocks.length ? blocks.map((b) => `
      <section class="panel ex-dest">
        <div class="ex-head">
          <b>${esc(b.dest)} ${esc(city(b.dest))}</b>
          <span class="small muted num">${b.tpeBest ? esc(t('exTpeBest', { v: money(b.tpeBest.priceTWD) })) : b.baseline ? esc(t('exNone', { v: money(b.baseline) })) : ''}</span>
        </div>
        ${b.rows.map(({ d, pos, total, save }) => `
          <button class="ex-row" data-act="ex-open" data-id="${esc(d.id)}" aria-expanded="${state.exOpen.has(d.id)}">
            <span class="ex-main">
              <span><b>${esc(d.origin)}</b> ${esc(city(d.origin))} · ${allianceMark(d.alliance)} ${esc(carrierLabel(d.primaryCarrier))}</span>
              <span class="small">${esc(tripText(d))} · ${esc(stopsText(d))}${d.viaHome ? ` · ${esc(t('viaHome'))}` : ''}</span>
              <span class="small num">${money(d.priceTWD)} + ${esc(t('exPositioning'))} ${money(pos)} = <b>${money(total)}</b></span>
            </span>
            <span class="ex-save">${save == null ? '' : save >= 0 ? `<span class="save">${esc(t('exSave', { v: money(save) }))}</span>` : `<span class="more">${esc(t('exMore', { v: money(-save) }))}</span>`}</span>
          </button>
          ${state.exOpen.has(d.id) ? `<div class="deal-detail ex-detail">${dealDetail(d)}</div>` : ''}`).join('')}
      </section>`).join('') : `<div class="empty">${esc(t('exEmpty'))}</div>`}
  `;
}

function posHtml() {
  const checked = visibleDeals().filter((d) => d.pos?.markets?.length);
  checked.sort((a, b) => (b.pos.best?.savingsPct ?? -99) - (a.pos.best?.savingsPct ?? -99) || a.priceTWD - b.priceTWD);
  const st = state.data.stats?.pos;
  return `
    <p class="intro">${esc(t('posIntro'))}</p>
    ${caveats(!checked.length)}
    ${state.data.isDemo && checked.length ? `<p class="small muted">${esc(t('posDemo'))}</p>` : ''}
    ${checked.length ? checked.map((d) => `
      <section class="panel ex-dest">
        <div class="ex-head">
          <b>${esc(d.origin)} – ${esc(d.destination)} ${esc(city(d.destination))}</b>
          <span class="small muted">${esc(t('posChecked', { n: d.pos.markets.length }))}</span>
        </div>
        <p class="small muted" style="margin:4px 0 10px">${esc(carrierLabel(d.primaryCarrier))} · ${allianceMark(d.alliance)} · ${esc(tripText(d))} · ${esc(stopsText(d))}</p>
        ${posRows(d)}
      </section>`).join('') : `<div class="empty">${esc(t('posEmpty'))}</div>`}
    ${st?.checked ? `<p class="small muted" style="text-align:center;margin-top:16px">${esc(t('posStat'))}: ${st.cheaper} / ${st.checked}</p>` : ''}
  `;
}

// ───────────────────────── Routes tab ─────────────────────────
function sparkline(entries) {
  if (!entries || entries.length < 2) return `<span class="small muted">${esc(t('noHistory'))}</span>`;
  const pts = entries.slice(-60);
  const prices = pts.map((e) => e[1]);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const W = 96;
  const H = 28;
  const x = (i) => (i / (pts.length - 1)) * (W - 4) + 2;
  const y = (p) => (max === min ? H / 2 : H - 3 - ((p - min) / (max - min)) * (H - 6));
  const minI = prices.indexOf(min);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('lowAll'))} ${money(min)}"><polyline points="${pts.map((e, i) => `${x(i).toFixed(1)},${y(e[1]).toFixed(1)}`).join(' ')}"/><circle cx="${x(minI).toFixed(1)}" cy="${y(min).toFixed(1)}" r="2.6"/></svg>`;
}

function quickSearchHtml() {
  const q = state.quick || (state.quick = { from: 'TPE', to: 'NRT', dep: '', ret: '', ow: false });
  const today = new Date();
  if (!q.dep) q.dep = new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10);
  if (!q.ret) q.ret = new Date(today.getTime() + 67 * 86400000).toISOString().slice(0, 10);
  const links = /^[A-Z]{3}$/.test(q.from) && /^[A-Z]{3}$/.test(q.to)
    ? searchLinks({ origin: q.from, destination: q.to, departDate: q.dep, returnDate: q.ow ? null : q.ret, currency: prefs.currency, lang: getLang() })
    : [];
  const origins = Object.keys(state.data?.origins || { TPE: 1 });
  return `
    <section class="panel">
      <h3>${esc(t('quickSearch'))}</h3>
      <datalist id="ap-list">${Object.entries(AIRPORTS).map(([c, a]) => `<option value="${c}">${esc(city(c))} · ${esc(a.en)}</option>`).join('')}</datalist>
      <div class="grid2">
        <div class="field"><label for="q-from">${esc(t('from'))}</label><input id="q-from" type="text" data-q="from" list="ap-list" value="${esc(q.from)}" maxlength="3" autocapitalize="characters"></div>
        <div class="field"><label for="q-to">${esc(t('to'))}</label><input id="q-to" type="text" data-q="to" list="ap-list" value="${esc(q.to)}" maxlength="3" autocapitalize="characters"></div>
        <div class="field"><label for="q-dep">${esc(t('depart'))}</label><input id="q-dep" type="date" data-q="dep" value="${esc(q.dep)}"></div>
        <div class="field"><label for="q-ret">${esc(t('ret'))}</label><input id="q-ret" type="date" data-q="ret" value="${esc(q.ret)}" ${q.ow ? 'disabled' : ''}></div>
      </div>
      <div class="chips" style="margin:12px 0">${chip('q-ow', '1', esc(t('oneWay')), q.ow)}${origins.map((o) => chip('q-from', o, esc(o), q.from === o)).join('')}</div>
      <div class="links">${links.map((l, i) => `<a class="btn${i === 0 ? ' primary' : ''}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}${ext()}</a>`).join('')}</div>
      <p class="small muted" style="margin-top:10px">${esc(t('quickNote'))}</p>
    </section>`;
}

function renderRoutes() {
  const el = $('#view-routes');
  if (!state.data) {
    el.innerHTML = skeleton();
    return;
  }
  if (!state.history) loadHistory();
  const today = state.data.scanDate;
  const cutoff = new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
  const routes = [...(state.data.routes || [])].sort((a, b) => (a.o === b.o ? 0 : a.o === 'TPE' ? -1 : b.o === 'TPE' ? 1 : a.o.localeCompare(b.o)) || a.p - b.p);
  const rows = routes.map((r) => {
    const latest = visibleDeals().filter((d) => d.routeKey === r.key).reduce((m, d) => (m && m.priceTWD <= d.priceTWD ? m : d), null);
    const h = historyFor(r.key);
    const low30 = h.filter((e) => e[0] >= cutoff).reduce((m, e) => Math.min(m, e[1]), Infinity);
    const lowAll = h.reduce((m, e) => Math.min(m, e[1]), Infinity);
    const target = prefs.targets[r.key];
    const hit = target && latest && latest.priceTWD <= target;
    return `
      <div class="route-row${hit ? ' hit' : ''}" id="route-${esc(r.key)}">
        <div class="rk">${esc(r.o)} – ${esc(r.d)}<small>${esc(city(r.d))} · ${esc(regionName(r.region))}</small></div>
        <div class="now">${latest ? money(latest.priceTWD) : '—'}</div>
        <div class="nums">${esc(t('low30'))} ${Number.isFinite(low30) ? money(low30) : '—'} · ${esc(t('lowAll'))} ${Number.isFinite(lowAll) ? money(lowAll) : '—'}${hit ? ` · <b class="save">${esc(t('alertHit'))}</b>` : ''}</div>
        <div>${state.history ? sparkline(h) : ''}</div>
        <label class="tgt">${icon('target', { size: 16 })}<span>${esc(t('target'))} (TWD)</span>
          <input type="number" inputmode="numeric" min="0" step="1000" data-target="${esc(r.key)}" value="${target || ''}" placeholder="${r.bm?.deal || ''}"></label>
      </div>`;
  }).join('');

  const add = state.addRoute || (state.addRoute = { o: 'TPE', d: '' });
  const reg = AIRPORTS[add.d]?.region;
  const bm = { JP: 'JP', KR: 'KR', SEA: 'SEA', EU: 'EU', NA: 'NA_WEST', OC: 'OC', ME: 'ME' }[reg] || 'EU';
  const snippet = /^[A-Z]{3}$/.test(add.d) ? `{ "o": "${add.o}", "d": "${add.d}", "p": 2, "bm": "${bm}", "stay": ${['JP', 'KR', 'SEA'].includes(reg) ? 5 : 12} }` : '';

  el.innerHTML = `
    ${quickSearchHtml()}
    <h2>${esc(t('routesTitle'))}</h2>
    ${carrierChips()}
    <section class="panel">${rows}</section>
    <section class="panel">
      <h3>${esc(t('addRoute'))}</h3>
      <div class="grid2">
        <div class="field"><label for="add-o">${esc(t('from'))}</label><input id="add-o" type="text" data-add="o" list="ap-list" value="${esc(add.o)}" maxlength="3"></div>
        <div class="field"><label for="add-d">${esc(t('to'))}</label><input id="add-d" type="text" data-add="d" list="ap-list" value="${esc(add.d)}" maxlength="3"></div>
      </div>
      ${snippet ? `<p class="small muted" style="margin-top:10px">${esc(t('addRouteHelp'))}</p><pre class="snippet">${esc(snippet)}</pre><button class="btn" data-act="copy" data-text="${esc(snippet)}">${icon('copy')}${esc(t('copy'))}</button>` : ''}
    </section>`;
}

// ───────────────────────── Settings tab ─────────────────────────
function setting(label, body, help = '') {
  return `<div class="setting"><span class="lbl">${esc(label)}</span>${body}${help ? `<span class="help">${esc(help)}</span>` : ''}</div>`;
}

function renderSettings() {
  const el = $('#view-settings');
  const d = state.data;
  const st = d?.stats || {};
  const currencies = d?.fx?.rates ? Object.keys(d.fx.rates) : ['TWD'];
  const origins = Object.entries(d?.origins || {}).filter(([, o]) => o.type === 'exstation');
  const canNotify = typeof Notification !== 'undefined';
  const kv = [
    [t('provider'), `${esc(d?.provider || '—')}${d?.isDemo ? ' (demo)' : ''}`],
    [t('updatedAt'), esc(fmtWhen(d?.generatedAt))],
    [t('searches'), `${st.searches ?? '—'} / ${st.planned ?? '—'}`],
    ...(st.quota ? [[t('quotaLeft'), esc(t('quotaValue', { n: st.quota.left, c: st.quota.dailyCap }))]] : []),
    [t('offersSeen'), st.offersSeen ?? '—'],
    [t('excluded'), st.excluded ? `${st.excluded.china} + ${st.excluded.unverified}` : '—'],
    [t('kept'), state.deals.length],
    ...(st.pos?.checked ? [[t('posStat'), `${st.pos.cheaper} / ${st.pos.checked}`]] : []),
    [t('errors'), st.errors?.length ?? 0],
    ['FX', `${esc(d?.fx?.date || '—')}`],
  ];

  el.innerHTML = `
    <div class="group-title">${esc(t('grpDisplay'))}</div>
    <section class="panel">
      ${setting(t('language'), `<div class="chips">${Object.entries(LANGS).map(([k, v]) => chip('set-lang', k, esc(v), prefs.lang === k)).join('')}</div>`)}
      ${setting(t('currency'), `<select data-set="currency" aria-label="${esc(t('currency'))}">${currencies.map((c) => `<option value="${c}" ${prefs.currency === c ? 'selected' : ''}>${SYM[c] || ''} ${c}</option>`).join('')}</select>`)}
      ${setting(t('theme'), `<div class="chips">${['auto', 'light', 'dark'].map((k) => chip('set-theme', k, esc(t('theme' + cap(k))), prefs.theme === k)).join('')}</div>`)}
    </section>

    <div class="group-title">${esc(t('grpPrefs'))}</div>
    <section class="panel">
      ${setting(t('skyteamBoost'), `<div class="chips">${['off', 'standard', 'strong'].map((k) => chip('set-boost', k, esc(t('boost' + cap(k))), prefs.skyteamBoost === k)).join('')}</div>`, t('skyteamHelp'))}
      ${origins.length ? setting(t('positioning'), `<div class="pos-grid">${origins.map(([code, o]) => `<label>${esc(code)} ${esc(city(code))}<input type="number" inputmode="numeric" min="0" step="500" data-pos="${esc(code)}" value="${positioningCost(code)}" placeholder="${o.positioningTWD ?? ''}"></label>`).join('')}</div>`) : ''}
    </section>

    <div class="group-title">${esc(t('notifications'))}</div>
    <section class="panel">
      ${notificationsPaused()
        ? setting(t('notifPausedTitle'), `<span class="help">${esc(t('notifPaused'))}</span>`)
        : setting(t('notifications'), `<div><button class="btn" data-act="notif" ${canNotify ? '' : 'disabled'}>${icon('bell')}${esc(canNotify && Notification.permission === 'granted' ? t('notifOn') : t('enableNotif'))}</button></div>`, t('notifHelp'))}
      ${setting(t('install'), '', t('installHelp'))}
    </section>

    <div class="group-title">${esc(t('grpData'))}</div>
    <section class="panel">
      <div class="kv">${kv.map(([k, v]) => `<span>${esc(k)}</span><span>${v}</span>`).join('')}</div>
      ${st.notes?.length ? `<p class="small muted" style="margin-top:10px">${esc(t('notesLbl'))}: ${st.notes.map(esc).join(' · ')}</p>` : ''}
      <div style="margin-top:12px"><button class="btn block" data-act="refresh">${icon('arrow-clockwise')}${esc(t('refresh'))}</button></div>
    </section>

    <div class="group-title">${esc(t('grpAbout'))}</div>
    <section class="panel">
      ${setting(t('exclusionTitle'), `<span class="help">${esc(t('exclusionBody'))}</span>`)}
      ${setting(`${t('blockedCarriers')} (${Object.keys(BLOCKED_CARRIERS).length})`, `<div class="codes">${Object.entries(BLOCKED_CARRIERS).map(([c, n]) => `<span class="code" title="${esc(n)}">${esc(c)}</span>`).join('')}</div>`)}
      ${st.samples?.length ? setting(t('blockedSamples'), `<ul class="plain">${st.samples.slice(0, 6).map((s) => `<li class="small">${esc(s.route)} · ${esc(s.carriers)} — ${esc(s.reason)}</li>`).join('')}</ul>`) : ''}
      ${setting(t('tipsTitle'), `<ul class="plain">${t('tips').map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)}
    </section>
    <p class="small muted" style="text-align:center;margin:20px 0">${Object.keys(AIRLINES).length} airlines · SkyTeam first</p>
  `;
}

// ───────────────────────── alerts ─────────────────────────
const notificationsPaused = () => state.data?.notifications === 'paused';

async function notify(title, body) {
  if (notificationsPaused()) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'bct-alert' });
    else new Notification(title, { body });
  } catch {
    /* ignore */
  }
}

function checkAlerts() {
  if (!state.data) return;
  const hits = [];
  for (const [rk, target] of Object.entries(prefs.targets)) {
    if (!target) continue;
    const best = visibleDeals().filter((d) => d.routeKey === rk).sort((a, b) => a.priceTWD - b.priceTWD)[0];
    if (best && best.priceTWD <= target && prefs.notified[rk] !== best.id) {
      hits.push(best);
      prefs.notified[rk] = best.id;
    }
  }
  let newHot = 0;
  if (prefs.lastScan !== state.data.scanDate) {
    newHot = visibleDeals().filter((d) => d.firstSeen === state.data.scanDate && d.tier === 'hot').length;
    prefs.lastScan = state.data.scanDate;
  }
  savePrefs();
  if (hits.length) {
    const msg = hits.map((d) => `${d.origin}–${d.destination} ${money(d.priceTWD)}`).join(' · ');
    toast(`${t('alertHit')}: ${msg}`, 6000);
    notify(t('alertHit'), msg);
  } else if (newHot && !state.data.isDemo) {
    toast(`${t('tier_hot')} × ${newHot}`);
    notify(t('appName'), `${t('tier_hot')} × ${newHot}`);
  }
}

// ───────────────────────── events ─────────────────────────
function findDeal(id) {
  const d = state.deals.find((x) => x.id === id);
  return d && rankDeals([d], 'score', { skyteamBoost: prefs.skyteamBoost })[0]; // adds _score/_tier/_cpk
}

function openCard(card, open = true) {
  const btn = card.querySelector('.deal-main');
  const det = card.querySelector('.deal-detail');
  if (open && !det.innerHTML) det.innerHTML = dealDetail(findDeal(btn.dataset.id));
  det.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
}

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('.tabbar button');
  if (tab) {
    go(tab.dataset.tab === 'special' && state.special === 'pos' ? '#special/pos' : `#${tab.dataset.tab}`);
    return;
  }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  const v = a.dataset.v;
  const f = prefs.filters;
  switch (act) {
    case 'toggle': {
      const card = a.closest('.deal');
      openCard(card, card.querySelector('.deal-detail').hidden);
      return;
    }
    case 'jump': {
      let card = document.getElementById(`deal-${a.dataset.id}`);
      if (!card) {
        // Best deal filtered out or beyond the current page: reset filters so it is visible.
        Object.assign(f, { ...DEFAULT_FILTERS, carrierType: f.carrierType });
        state.limit = 40;
        savePrefs();
        renderDeals();
        card = document.getElementById(`deal-${a.dataset.id}`);
      }
      if (card) {
        openCard(card, true);
        card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      }
      return;
    }
    case 'filters':
      state.filtersOpen = !state.filtersOpen;
      renderDeals();
      return;
    case 'clear-filters':
      Object.assign(f, { ...DEFAULT_FILTERS, carrierType: f.carrierType, sort: f.sort, origin: f.origin });
      state.limit = 40;
      break;
    case 'special':
      go(v === 'pos' ? '#special/pos' : '#special');
      return;
    case 'ex-open':
      state.exOpen.has(a.dataset.id) ? state.exOpen.delete(a.dataset.id) : state.exOpen.add(a.dataset.id);
      renderSpecial();
      return;
    case 'f-alliance': f.alliance = v; state.limit = 40; break;
    case 'f-carrier': f.carrierType = v; state.limit = 40; break;
    case 'f-toggle': f[v] = !f[v]; state.limit = 40; break;
    case 'more': state.limit += 40; break;
    case 'set-lang': prefs.lang = v; prefs.langChosen = true; break;
    case 'set-theme': prefs.theme = v; applyTheme(); break;
    case 'set-boost': prefs.skyteamBoost = v; break;
    case 'q-ow': state.quick.ow = !state.quick.ow; break;
    case 'q-from': state.quick.from = v; break;
    case 'refresh': loadData(true); return;
    case 'target': {
      go('#routes');
      requestAnimationFrame(() => {
        const input = document.querySelector(`[data-target="${CSS.escape(a.dataset.route)}"]`);
        input?.scrollIntoView({ block: 'center' });
        input?.focus({ preventScroll: true });
      });
      return;
    }
    case 'copy':
      try {
        await navigator.clipboard.writeText(a.dataset.text);
        toast(t('copied'));
      } catch {
        toast(a.dataset.text, 8000);
      }
      return;
    case 'notif':
      if (typeof Notification !== 'undefined') {
        await Notification.requestPermission();
        renderSettings();
      }
      return;
    default:
      return;
  }
  savePrefs();
  render();
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.f) {
    prefs.filters[el.dataset.f] = el.value;
    state.limit = 40;
  } else if (el.dataset.set) prefs[el.dataset.set] = el.value;
  else if (el.dataset.pos) {
    const n = Number(el.value);
    if (el.value === '' || !Number.isFinite(n)) delete prefs.positioning[el.dataset.pos];
    else prefs.positioning[el.dataset.pos] = n;
  } else if (el.dataset.target) {
    const n = Number(el.value);
    if (!el.value || !Number.isFinite(n) || n <= 0) delete prefs.targets[el.dataset.target];
    else prefs.targets[el.dataset.target] = n;
    delete prefs.notified[el.dataset.target];
    savePrefs();
    renderRoutes();
    checkAlerts();
    return;
  } else if (el.dataset.q) {
    state.quick[el.dataset.q] = el.dataset.q === 'from' || el.dataset.q === 'to' ? el.value.trim().toUpperCase() : el.value;
  } else if (el.dataset.add) {
    state.addRoute[el.dataset.add] = el.value.trim().toUpperCase();
  } else return;
  savePrefs();
  render();
});

// Hide airline logos that fail to load (the carrier code underneath shows instead).
document.addEventListener('error', (e) => {
  if (e.target?.classList?.contains('logo')) e.target.style.visibility = 'hidden';
}, true);

$('#refresh-btn').addEventListener('click', () => loadData(true));
window.addEventListener('online', renderBanner);
window.addEventListener('offline', renderBanner);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installEvt = e;
  $('#install-btn').hidden = false;
});
$('#install-btn').addEventListener('click', async () => {
  if (!state.installEvt) return;
  state.installEvt.prompt();
  await state.installEvt.userChoice.catch(() => null);
  state.installEvt = null;
  $('#install-btn').hidden = true;
});

// ───────────────────────── boot ─────────────────────────
$('#refresh-btn').innerHTML = icon('arrow-clockwise', { size: 22 });
$('#install-btn').innerHTML = icon('download-simple', { size: 22 });
document.querySelectorAll('.tabbar button[data-icon]').forEach((b) => b.insertAdjacentHTML('afterbegin', icon(b.dataset.icon, { size: 24 })));
applyTheme();
setLang(prefs.lang);
readHash();
render();
loadData();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
