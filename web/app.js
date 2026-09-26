// Business Class Radar — PWA front-end (vanilla ES modules, no build step).
import { t, setLang, getLang, LANGS, regionName } from './i18n.js';
import { ALLIANCES, ALLIANCE_ORDER, BLOCKED_CARRIERS, AIRLINES, airlineName } from './core/airlines.js';
import { AIRPORTS, airportCity } from './core/airports.js';
import { rankDeals } from './core/scoring.js';
import { isChinaFree } from './core/exclusion.js';
import { searchLinks, airlineUrl } from './core/links.js';

// ───────────────────────── prefs (per-device) ─────────────────────────
const PREF_KEY = 'bct.prefs.v1';
const DEFAULT_FILTERS = { origin: 'all', region: 'all', alliance: 'all', nonstop: false, flat: false, hideBudget: false, minTier: 'all', sort: 'score' };

function guessLang() {
  const l = (navigator.language || 'zh-TW').toLowerCase();
  if (l.startsWith('ko')) return 'ko';
  if (l.startsWith('en')) return 'en';
  return 'zh-TW';
}

function loadPrefs() {
  const base = { lang: guessLang(), currency: 'TWD', theme: 'auto', skyteamBoost: 'standard', positioning: {}, targets: {}, notified: {}, lastScan: null, filters: { ...DEFAULT_FILTERS } };
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return { ...base, ...saved, filters: { ...DEFAULT_FILTERS, ...(saved.filters || {}) } };
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
const state = { data: null, deals: [], history: null, tab: 'deals', error: null, dropped: 0, limit: 60, installEvt: null, exOpen: new Set() };

// ───────────────────────── helpers ─────────────────────────
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const locale = () => ({ 'zh-TW': 'zh-TW', en: 'en-US', ko: 'ko-KR' })[getLang()] || 'zh-TW';
const SYM = { TWD: 'NT$', USD: 'US$', KRW: '₩', JPY: '¥', EUR: '€', THB: '฿', VND: '₫', SGD: 'S$', PHP: '₱', MYR: 'RM', GBP: '£', AUD: 'A$' };
const TIER_ORDER = ['hot', 'great', 'good', 'fair'];

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
function moneyPerKm(twdPerKm) {
  if (twdPerKm == null) return '';
  let c = prefs.currency;
  let r = rate(c);
  if (!r) {
    c = 'TWD';
    r = 1;
  }
  const v = twdPerKm * r;
  const digits = v < 1 ? 3 : v < 10 ? 2 : v < 100 ? 1 : 0;
  return t('perKm', { v: (SYM[c] || c) + v.toFixed(digits) });
}
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
const hhmm = (s) => (s ? String(s).slice(11, 16) : '');
const dayDiff = (a, b) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
const city = (code) => airportCity(code, getLang());
const carrierLabel = (code) => airlineName(code, getLang());

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

// ───────────────────────── data ─────────────────────────
async function loadData(force = false) {
  $('#refresh-btn').classList.add('spin');
  try {
    const res = await fetch(`data/deals.json${force ? `?t=${Date.now()}` : ''}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
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
    const res = await fetch('data/history.json', { cache: 'no-cache' });
    state.history = res.ok ? await res.json() : { routes: {} };
  } catch {
    state.history = { routes: {} };
  }
  if (state.tab === 'routes') renderRoutes();
}

function filteredDeals() {
  const f = prefs.filters;
  let list = state.deals.filter((d) => {
    if (f.origin === 'home' && d.originType !== 'home') return false;
    if (f.origin === 'ex' && d.originType !== 'exstation') return false;
    if (f.region !== 'all' && d.region !== f.region) return false;
    if (f.alliance !== 'all' && d.alliance !== f.alliance) return false;
    if (f.nonstop && d.stops !== 0) return false;
    if (f.flat && d.lieFlat !== true) return false;
    if (f.hideBudget && d.budget) return false;
    return true;
  });
  list = rankDeals(list, f.sort, { skyteamBoost: prefs.skyteamBoost });
  if (f.minTier !== 'all') {
    const max = TIER_ORDER.indexOf(f.minTier);
    list = list.filter((d) => TIER_ORDER.indexOf(d._tier) <= max);
  }
  return list;
}

// ───────────────────────── rendering: shared ─────────────────────────
function render() {
  setLang(prefs.lang);
  document.title = `${t('appName')} · ${t('appSub')}`;
  $('#app-name').textContent = t('appName');
  $('#app-sub').textContent = t('appSub');
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll('.tabbar button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'));
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== `view-${state.tab}`));
  renderBanner();
  ({ deals: renderDeals, ex: renderEx, routes: renderRoutes, settings: renderSettings })[state.tab]();
}

function renderBanner() {
  const b = $('#banner');
  const msgs = [];
  let warn = false;
  if (state.data?.isDemo) msgs.push(t('demoBanner'));
  if (!navigator.onLine) {
    msgs.push(t('offline'));
    warn = true;
  }
  if (state.dropped) {
    msgs.push(`⚠ ${state.dropped} deal(s) hidden by in-app China/HK/Macau re-check.`);
    warn = true;
  }
  b.hidden = !msgs.length;
  b.className = `banner${warn ? ' warn' : ''}`;
  b.textContent = msgs.join(' · ');
}

function logo(code) {
  // Carrier code shows through if the logo image fails to load.
  return `<span class="logo-wrap"><span class="logo-code">${esc(code)}</span><img class="logo" src="https://www.gstatic.com/flights/airline_logos/70px/${esc(code)}.png" alt="" loading="lazy"></span>`;
}

function allianceBadge(a) {
  return `<span class="al al-${esc(a)}">${esc(ALLIANCES[a]?.name || a)}</span>`;
}

function dealBadges(d) {
  const b = [];
  if (d._errorFare) b.push(`<span class="badge hot">⚡ ${t('errorFare')}</span>`);
  if (d.label) b.push(`<span class="badge gold">🎯 ${esc(d.label)}</span>`);
  if (d.lieFlat === true) b.push(`<span class="badge ok">🛏 ${t('lieFlat')}</span>`);
  if (d.lieFlat === false) b.push(`<span class="badge warn">${t('recliner')}</span>`);
  if (d.viaHome && d.originType === 'exstation') b.push(`<span class="badge gold">★ ${t('viaHome')}</span>`);
  if (d.budget) b.push(`<span class="badge">${t('budget')}</span>`);
  if (d.mixedCabin) b.push(`<span class="badge warn">${t('mixedCabin')}</span>`);
  if (d.overnightLayover) b.push(`<span class="badge warn">🌙 ${t('overnight')}</span>`);
  else if (d.longestLayoverMin > 480) b.push(`<span class="badge warn">${t('longLayover')}</span>`);
  b.push(`<span class="badge ok">${d.inboundVerified ? t('chinaFree') : t('chinaFreeOut')}</span>`);
  if (d.ageDays > 0) b.push(`<span class="badge">${t('seen', { n: d.ageDays })}</span>`);
  return b.join('');
}

function stopsText(d) {
  const leg = d.legs?.[0];
  const dur = fmtDur(leg?.durationMin);
  if (d.stops === 0) return `${t('nonstop')}${dur ? ' · ' + dur : ''}`;
  const via = (d.via || []).join(', ');
  return `${t('stops', { n: d.stops })}${via ? ' · ' + t('via', { v: via }) : ''}`;
}

function dealCard(d) {
  const days = d.returnDate ? dayDiff(d.departDate, d.returnDate) : null;
  const disc = d._discount;
  const discHtml = disc == null ? '' : disc > 0
    ? `<span class="disc">▼${disc}% ${t('vsTypical', { p: '' }).trim()}</span>`
    : `<span class="disc up">▲${Math.abs(disc)}%</span>`;
  return `
  <article class="deal tier-${d._tier}" data-id="${esc(d.id)}">
    <button class="deal-main" data-act="toggle" data-id="${esc(d.id)}" aria-expanded="false">
      <div class="deal-top">
        ${allianceBadge(d.alliance)}
        <span class="carrier">${logo(d.primaryCarrier)}<span>${esc(carrierLabel(d.primaryCarrier))}</span></span>
        <span class="tier">${t('tier_' + d._tier)}<b>${d._score}</b></span>
      </div>
      <div class="deal-route">
        <div class="ap"><b>${esc(d.origin)}</b><small>${esc(city(d.origin))}</small></div>
        <div class="line"><span>${esc(stopsText(d))}</span></div>
        <div class="ap r"><b>${esc(d.destination)}</b><small>${esc(city(d.destination))}</small></div>
      </div>
      <div class="deal-dates">${fmtDay(d.departDate)}${d.returnDate ? ` → ${fmtDay(d.returnDate)} · ${t('rt')} · ${days}d` : ` · ${t('ow')}`}</div>
      <div class="deal-price">
        <span class="price">${money(d.priceTWD)}</span>
        ${discHtml}
        <span class="cpk">${moneyPerKm(d._cpk)}</span>
      </div>
      <div class="badges">${dealBadges(d)}</div>
    </button>
    <div class="deal-detail" hidden></div>
  </article>`;
}

function legHtml(leg, title, date) {
  const parts = [];
  leg.segments.forEach((s, i) => {
    const plus = s.dep && s.arr ? dayDiff(s.dep, s.arr) : 0;
    const op = s.operatingName && !String(s.operatingName).toLowerCase().includes(String(s.carrierName || carrierLabel(s.carrier)).toLowerCase())
      ? ` · operated by ${esc(s.operatingName)}` : '';
    const flat = s.lieFlat === true ? ` · 🛏 ${t('lieFlat')}` : s.lieFlat === false ? ` · ${t('recliner')}` : '';
    parts.push(`<li class="seg">
      <div class="t">${esc(hhmm(s.dep))} ${esc(s.from)} → ${esc(hhmm(s.arr))}${plus > 0 ? `<sup>+${plus}</sup>` : ''} ${esc(s.to)} <span class="muted small">${esc(city(s.to))}</span></div>
      <div class="m">${esc(s.flightNumber || s.carrier)} · ${esc(carrierLabel(s.carrier))}${s.aircraft ? ' · ' + esc(s.aircraft) : ''}${s.cabin ? ' · ' + esc(s.cabin) : ''}${flat} · ${fmtDur(s.durationMin)}${op}</div>
    </li>`);
    const l = leg.layovers?.[i];
    if (l && i < leg.segments.length - 1) {
      const long = l.durationMin > 480 || l.overnight;
      parts.push(`<li class="lay${long ? ' warn' : ''}">${t('layover', { a: esc(l.airport) + ' ' + esc(city(l.airport)), d: fmtDur(l.durationMin) })}${l.overnight ? ' · 🌙' : ''}</li>`);
    }
  });
  return `<div class="leg"><h4>${title} · ${fmtDay(date)}</h4><ol class="segs">${parts.join('')}</ol></div>`;
}

function dealDetail(d) {
  const legs = [legHtml(d.legs[0], t('outbound'), d.departDate)];
  if (d.legs[1]) legs.push(legHtml(d.legs[1], t('inbound'), d.returnDate));
  else if (d.returnDate) legs.push(`<p class="small muted">↩ ${t('inboundUnknown')}</p>`);
  const r = d.reference;
  const ref = r
    ? `${t('ref_' + r.source)}: ${money(r.value)}${r.low && r.high ? ` (${money(r.low)} – ${money(r.high)})` : ''}${d.priceLevel ? ` · Google: ${esc(d.priceLevel)}` : ''}`
    : '';
  const links = searchLinks({ origin: d.origin, destination: d.destination, departDate: d.departDate, returnDate: d.returnDate, currency: prefs.currency, lang: getLang() });
  const site = airlineUrl(d.primaryCarrier);
  return `${legs.join('')}
    <div class="ref">${ref}${d.price && d.currency !== 'TWD' ? ` · ${esc(d.currency)} ${Math.round(d.price).toLocaleString()}` : ''}</div>
    <div class="links">
      ${links.map((l, i) => `<a class="btn${i === 0 ? ' primary' : ''}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}
      ${site ? `<a class="btn ghost" href="${esc(site)}" target="_blank" rel="noopener">${t('airlineSite')} ↗</a>` : ''}
      <button class="btn ghost" data-act="target" data-route="${esc(d.routeKey)}">🎯 ${t('setAlert')}</button>
    </div>`;
}

// ───────────────────────── Deals tab ─────────────────────────
function chip(act, value, label, pressed, extraClass = '') {
  return `<button class="chip ${extraClass}" data-act="${act}" data-v="${esc(value)}" aria-pressed="${pressed}">${label}</button>`;
}

function renderDeals() {
  const el = $('#view-deals');
  if (!state.data) {
    el.innerHTML = state.error ? `<div class="empty">${t('loadFail')} (${esc(state.error)})</div>` : `<div class="skeleton" style="margin-top:16px"></div>`;
    return;
  }
  const d = state.data;
  const f = prefs.filters;
  const ranked = rankDeals(state.deals, 'score', { skyteamBoost: prefs.skyteamBoost });
  const top = ranked[0];
  const greatCount = ranked.filter((x) => x._tier === 'hot' || x._tier === 'great').length;
  const regions = ['JP', 'KR', 'SEA', 'SAS', 'OC', 'EU', 'NA', 'ME', 'LATAM', 'AF', 'CAS', 'TW', 'OTHER'].filter((r) => state.deals.some((x) => x.region === r));
  const list = filteredDeals();
  const updated = new Date(d.generatedAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });

  el.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${top ? money(top.priceTWD) : '—'}</b><span>${t('statBest')}${top ? ` · ${esc(top.origin)}→${esc(top.destination)}` : ''}</span></div>
      <div class="stat"><b>${greatCount}</b><span>${t('statHot')}</span></div>
      <div class="stat shield"><b>🛡 ${d.stats?.excluded?.china ?? 0}</b><span>${t('statExcluded')}</span></div>
      <div class="stat"><b>${d.routes?.length ?? 0}</b><span>${t('statRoutes')}</span></div>
    </div>
    <div class="updated">${t('updated', { t: esc(updated) })} · ${t('provider')}: ${esc(d.provider)}</div>
    <div class="filters">
      <div class="chips">
        ${chip('f-origin', 'all', t('filterAll'), f.origin === 'all')}
        ${chip('f-origin', 'home', '🏠 ' + t('filterHome'), f.origin === 'home')}
        ${chip('f-origin', 'ex', '🔁 ' + t('filterEx'), f.origin === 'ex')}
        <span class="chip-sep"></span>
        ${chip('f-toggle', 'nonstop', t('nonstopOnly'), f.nonstop)}
        ${chip('f-toggle', 'flat', '🛏 ' + t('flatOnly'), f.flat)}
        ${chip('f-toggle', 'hideBudget', t('hideBudget'), f.hideBudget)}
      </div>
      <div class="chips" style="margin-top:6px">
        ${ALLIANCE_ORDER.map((a) => chip('f-alliance', a, esc(ALLIANCES[a].name), f.alliance === a, `al-${a}`)).join('')}
        ${chip('f-alliance', 'all', t('allAlliances'), f.alliance === 'all')}
      </div>
      <div class="row">
        <select data-f="region" aria-label="${t('region')}">
          <option value="all">${t('allRegions')}</option>
          ${regions.map((r) => `<option value="${r}" ${f.region === r ? 'selected' : ''}>${esc(regionName(r))}</option>`).join('')}
        </select>
        <select data-f="minTier" aria-label="${t('minTier')}">
          <option value="all">${t('allTiers')}</option>
          ${TIER_ORDER.slice(0, 3).map((k) => `<option value="${k}" ${f.minTier === k ? 'selected' : ''}>${t('tier_' + k)}+</option>`).join('')}
        </select>
        <select data-f="sort" aria-label="${t('sort')}">
          ${['score', 'price', 'discount', 'alliance', 'cpk', 'date'].map((k) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${t('sort' + k[0].toUpperCase() + k.slice(1))}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="list">
      ${list.length ? list.slice(0, state.limit).map(dealCard).join('') : `<div class="empty">${t('noDeals')}</div>`}
    </div>
    ${list.length > state.limit ? `<div style="text-align:center;margin:14px 0"><button class="btn" data-act="more">+ ${list.length - state.limit}</button></div>` : ''}
  `;
}

// ───────────────────────── Ex-station tab ─────────────────────────
function positioningCost(o) {
  const v = prefs.positioning[o];
  if (Number.isFinite(v) && v >= 0) return v;
  return state.data?.origins?.[o]?.positioningTWD ?? 0;
}

function renderEx() {
  const el = $('#view-ex');
  if (!state.data) {
    el.innerHTML = `<div class="skeleton" style="margin-top:16px"></div>`;
    return;
  }
  const deals = rankDeals(state.deals, 'price', { skyteamBoost: prefs.skyteamBoost });
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

  el.innerHTML = `
    <h2>${t('exTitle')}</h2>
    <div class="panel"><p>${t('exIntro')}</p><p class="small muted">${t('exRules')} ${t('exEdit')}</p></div>
    ${blocks.length ? blocks.map((b) => `
      <div class="panel ex-dest">
        <div class="ex-head">
          <div><b>✈ ${esc(b.dest)} ${esc(city(b.dest))}</b></div>
          <div class="small muted">${b.tpeBest ? `${t('exTpeBest')}: <b>${money(b.tpeBest.priceTWD)}</b>` : b.baseline ? `${t('exNone')}: ${money(b.baseline)}` : ''}</div>
        </div>
        <div class="ex-rows">
          ${b.rows.map(({ d, pos, total, save }) => `
            <div class="ex-row" data-act="ex-open" data-id="${esc(d.id)}" role="button" tabindex="0" aria-expanded="${state.exOpen.has(d.id)}">
              <div class="ex-main">
                <div><b>${esc(d.origin)}</b> <span class="muted">${esc(city(d.origin))}</span> ${allianceBadge(d.alliance)} <span class="small">${esc(carrierLabel(d.primaryCarrier))}</span>${d.viaHome ? ' <span class="small" style="color:var(--gold)">★ ' + t('via', { v: 'TPE' }) + '</span>' : ''}</div>
                <div class="small muted">${fmtDay(d.departDate)}${d.returnDate ? ' → ' + fmtDay(d.returnDate) : ''} · ${esc(stopsText(d))}</div>
                <div class="small">${money(d.priceTWD)} <span class="muted">+ ${t('exPositioning')} ${money(pos)} =</span> <b>${money(total)}</b></div>
              </div>
              <div class="ex-save">${save == null ? '' : save >= 0 ? `<span class="save">${t('exSave', { v: money(save) })}</span>` : `<span class="more">${t('exMore', { v: money(-save) })}</span>`}</div>
            </div>
            ${state.exOpen.has(d.id) ? `<div class="deal-detail ex-detail">${dealDetail(d)}</div>` : ''}`).join('')}
        </div>
      </div>`).join('') : `<div class="empty">${t('exEmpty')}</div>`}
  `;
}

// ───────────────────────── Routes tab ─────────────────────────
function sparkline(entries) {
  if (!entries || entries.length < 2) return `<span class="small muted">${t('noHistory')}</span>`;
  const pts = entries.slice(-60);
  const prices = pts.map((e) => e[1]);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const W = 120;
  const H = 34;
  const x = (i) => (i / (pts.length - 1)) * (W - 4) + 2;
  const y = (p) => (max === min ? H / 2 : H - 3 - ((p - min) / (max - min)) * (H - 6));
  const minI = prices.indexOf(min);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="price trend"><polyline points="${pts.map((e, i) => `${x(i).toFixed(1)},${y(e[1]).toFixed(1)}`).join(' ')}"/><circle cx="${x(minI).toFixed(1)}" cy="${y(min).toFixed(1)}" r="2.6"/></svg>`;
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
    <div class="panel">
      <h3>🔎 ${t('quickSearch')}</h3>
      <datalist id="ap-list">${Object.entries(AIRPORTS).map(([c, a]) => `<option value="${c}">${esc(city(c))} · ${esc(a.en)}</option>`).join('')}</datalist>
      <div class="grid2">
        <div class="field"><label for="q-from">${t('from')}</label><input id="q-from" type="text" data-q="from" list="ap-list" value="${esc(q.from)}" maxlength="3" autocapitalize="characters"></div>
        <div class="field"><label for="q-to">${t('to')}</label><input id="q-to" type="text" data-q="to" list="ap-list" value="${esc(q.to)}" maxlength="3" autocapitalize="characters"></div>
        <div class="field"><label for="q-dep">${t('depart')}</label><input id="q-dep" type="date" data-q="dep" value="${esc(q.dep)}"></div>
        <div class="field"><label for="q-ret">${t('ret')}</label><input id="q-ret" type="date" data-q="ret" value="${esc(q.ret)}" ${q.ow ? 'disabled' : ''}></div>
      </div>
      <div class="chips" style="margin-bottom:10px">${chip('q-ow', '1', t('oneWay'), q.ow)} ${origins.map((o) => chip('q-from', o, o, q.from === o)).join('')}</div>
      <div class="links" id="quick-links">${links.map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>
      <p class="small muted" style="margin-top:8px">${t('quickNote')}</p>
    </div>`;
}

function renderRoutes() {
  const el = $('#view-routes');
  if (!state.data) {
    el.innerHTML = `<div class="skeleton" style="margin-top:16px"></div>`;
    return;
  }
  if (!state.history) loadHistory();
  const hist = state.history?.routes || {};
  const today = state.data.scanDate;
  const cutoff = new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
  const routes = [...(state.data.routes || [])].sort((a, b) => (a.o === b.o ? 0 : a.o === 'TPE' ? -1 : b.o === 'TPE' ? 1 : a.o.localeCompare(b.o)) || a.p - b.p);
  const rows = routes.map((r) => {
    const latest = state.deals.filter((d) => d.routeKey === r.key).reduce((m, d) => (m && m.priceTWD <= d.priceTWD ? m : d), null);
    const h = hist[r.key] || [];
    const low30 = h.filter((e) => e[0] >= cutoff).reduce((m, e) => Math.min(m, e[1]), Infinity);
    const lowAll = h.reduce((m, e) => Math.min(m, e[1]), Infinity);
    const target = prefs.targets[r.key];
    const hit = target && latest && latest.priceTWD <= target;
    return `
      <div class="route-row${hit ? ' hit' : ''}" id="route-${esc(r.key)}">
        <div>
          <div class="rk">${esc(r.o)} → ${esc(r.d)}<small>${esc(city(r.d))} · ${esc(regionName(r.region))}</small></div>
          <div class="nums">${t('latest')}: <b>${latest ? money(latest.priceTWD) : '—'}</b> · ${t('low30')}: ${Number.isFinite(low30) ? money(low30) : '—'} · ${t('lowAll')}: ${Number.isFinite(lowAll) ? money(lowAll) : '—'}${hit ? ` · <b style="color:var(--good)">✓ ${t('alertHit')}</b>` : ''}</div>
        </div>
        <div>${state.history ? sparkline(h) : ''}</div>
        <div class="tgt" style="grid-column:1/-1">
          <span class="small muted">🎯 ${t('target')} (TWD)</span>
          <input type="number" inputmode="numeric" min="0" step="1000" data-target="${esc(r.key)}" value="${target || ''}" placeholder="${r.bm?.deal || ''}">
        </div>
      </div>`;
  }).join('');

  const add = state.addRoute || (state.addRoute = { o: 'TPE', d: '' });
  const reg = AIRPORTS[add.d]?.region;
  const bm = { JP: 'JP', KR: 'KR', SEA: 'SEA', EU: 'EU', NA: 'NA_WEST', OC: 'OC', ME: 'ME' }[reg] || 'EU';
  const snippet = /^[A-Z]{3}$/.test(add.d) ? `{ "o": "${add.o}", "d": "${add.d}", "p": 2, "bm": "${bm}", "stay": ${['JP', 'KR', 'SEA'].includes(reg) ? 5 : 12} }` : '';

  el.innerHTML = `
    ${quickSearchHtml()}
    <h2>📈 ${t('routesTitle')}</h2>
    <div class="panel">${rows}</div>
    <div class="panel">
      <h3>➕ ${t('addRoute')}</h3>
      <div class="grid2">
        <div class="field"><label for="add-o">${t('from')}</label><input id="add-o" type="text" data-add="o" list="ap-list" value="${esc(add.o)}" maxlength="3"></div>
        <div class="field"><label for="add-d">${t('to')}</label><input id="add-d" type="text" data-add="d" list="ap-list" value="${esc(add.d)}" maxlength="3"></div>
      </div>
      ${snippet ? `<p class="small muted">${t('addRouteHelp')}</p><pre class="snippet">${esc(snippet)}</pre><button class="btn" data-act="copy" data-text="${esc(snippet)}">${t('copy')}</button>` : ''}
    </div>`;
}

// ───────────────────────── Settings tab ─────────────────────────
function renderSettings() {
  const el = $('#view-settings');
  const d = state.data;
  const st = d?.stats || {};
  const currencies = d?.fx?.rates ? Object.keys(d.fx.rates) : ['TWD'];
  const origins = Object.entries(d?.origins || {}).filter(([, o]) => o.type === 'exstation');
  el.innerHTML = `
    <h2>${t('settingsTitle')}</h2>
    <div class="panel">
      <div class="field"><label>${t('language')}</label><div class="seg-ctl">${Object.entries(LANGS).map(([k, v]) => chip('set-lang', k, v, prefs.lang === k)).join('')}</div></div>
      <div class="field"><label>${t('currency')}</label>
        <select data-set="currency">${currencies.map((c) => `<option value="${c}" ${prefs.currency === c ? 'selected' : ''}>${SYM[c] || ''} ${c}</option>`).join('')}</select></div>
      <div class="field"><label>${t('theme')}</label><div class="seg-ctl">${['auto', 'dark', 'light'].map((k) => chip('set-theme', k, t('theme' + k[0].toUpperCase() + k.slice(1)), prefs.theme === k)).join('')}</div></div>
      <div class="field"><label>${t('skyteamBoost')}</label><div class="seg-ctl">${['off', 'standard', 'strong'].map((k) => chip('set-boost', k, t('boost' + k[0].toUpperCase() + k.slice(1)), prefs.skyteamBoost === k, k !== 'off' ? 'al-SKYTEAM' : '')).join('')}</div>
        <span class="small muted">${t('skyteamHelp')}</span></div>
    </div>

    ${origins.length ? `<div class="panel"><h3>🔁 ${t('positioning')}</h3><div class="pos-grid">
      ${origins.map(([code, o]) => `<label>${esc(code)} ${esc(city(code))}<input type="number" inputmode="numeric" min="0" step="500" data-pos="${esc(code)}" value="${positioningCost(code)}" placeholder="${o.positioningTWD ?? ''}"></label>`).join('')}
    </div></div>` : ''}

    <div class="panel">
      <h3>🔔 ${t('notifications')}</h3>
      <button class="btn" data-act="notif" ${typeof Notification === 'undefined' ? 'disabled' : ''}>${typeof Notification !== 'undefined' && Notification.permission === 'granted' ? '✓ ' + t('notifOn') : t('enableNotif')}</button>
      <p class="small muted" style="margin-top:8px">${t('notifHelp')}</p>
      <p class="small muted">📲 ${t('install')}: ${t('installHelp')}</p>
    </div>

    <div class="panel">
      <h3>🛡 ${t('exclusionTitle')}</h3>
      <p class="small">${t('exclusionBody')}</p>
      <div class="field"><label>${t('blockedCarriers')} (${Object.keys(BLOCKED_CARRIERS).length})</label>
        <div class="codes">${Object.entries(BLOCKED_CARRIERS).map(([c, n]) => `<span class="code" title="${esc(n)}">${esc(c)}</span>`).join('')}</div></div>
      ${st.samples?.length ? `<div class="field"><label>${t('blockedSamples')}</label>
        <ul class="tips">${st.samples.slice(0, 8).map((s) => `<li class="small">${esc(s.route)} · ${esc(s.carriers)} — ${esc(s.reason)}</li>`).join('')}</ul></div>` : ''}
    </div>

    <div class="panel">
      <h3>📊 ${t('dataTitle')}</h3>
      <div class="kv">
        <span>${t('provider')}</span><span>${esc(d?.provider || '—')}${d?.isDemo ? ' (demo)' : ''}</span>
        <span>${t('updated', { t: '' }).trim()}</span><span>${d ? esc(new Date(d.generatedAt).toLocaleString(locale())) : '—'}</span>
        <span>${t('searches')}</span><span>${st.searches ?? '—'} / ${st.planned ?? '—'}</span>
        <span>${t('offersSeen')}</span><span>${st.offersSeen ?? '—'}</span>
        <span>${t('statExcluded')}</span><span>${st.excluded ? `${st.excluded.china} + ${st.excluded.unverified} unverified` : '—'}</span>
        <span>${t('kept')}</span><span>${state.deals.length}</span>
        <span>${t('errors')}</span><span>${st.errors?.length ?? 0}</span>
        <span>FX</span><span>${esc(d?.fx?.date || '—')} · ${esc(d?.fx?.source || '')}</span>
      </div>
      <div style="margin-top:10px"><button class="btn" data-act="refresh">↻ ${t('refresh')}</button></div>
    </div>

    <div class="panel">
      <h3>🧭 ${t('tipsTitle')}</h3>
      <ul class="tips">${t('tips').map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
    <p class="small muted" style="text-align:center;margin:18px 0">Airlines: ${Object.keys(AIRLINES).length} · SkyTeam first · ${new Date().getFullYear()}</p>
  `;
}

// ───────────────────────── alerts ─────────────────────────
async function notify(title, body) {
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
    const best = state.deals.filter((d) => d.routeKey === rk).sort((a, b) => a.priceTWD - b.priceTWD)[0];
    if (best && best.priceTWD <= target && prefs.notified[rk] !== best.id) {
      hits.push(best);
      prefs.notified[rk] = best.id;
    }
  }
  let newHot = 0;
  if (prefs.lastScan !== state.data.scanDate) {
    newHot = state.deals.filter((d) => d.firstSeen === state.data.scanDate && d.tier === 'hot').length;
    prefs.lastScan = state.data.scanDate;
  }
  savePrefs();
  if (hits.length) {
    const msg = hits.map((d) => `${d.origin}→${d.destination} ${money(d.priceTWD)}`).join(' · ');
    toast(`🎯 ${t('alertHit')} ${msg}`, 6000);
    notify(`🎯 ${t('alertHit')}`, msg);
  } else if (newHot && !state.data.isDemo) {
    toast(`🔥 ${newHot} × ${t('tier_hot')}`);
    notify(t('appName'), `🔥 ${newHot} × ${t('tier_hot')}`);
  }
}

// ───────────────────────── events ─────────────────────────
function findDeal(id) {
  return state.deals.find((d) => d.id === id);
}

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('.tabbar button');
  if (tab) {
    state.tab = tab.dataset.tab;
    render();
    window.scrollTo({ top: 0 });
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
      const det = card.querySelector('.deal-detail');
      if (det.hidden && !det.innerHTML) det.innerHTML = dealDetail(findDeal(a.dataset.id));
      det.hidden = !det.hidden;
      a.setAttribute('aria-expanded', String(!det.hidden));
      return;
    }
    case 'ex-open':
      if (e.target.closest('a,button')) return;
      state.exOpen.has(a.dataset.id) ? state.exOpen.delete(a.dataset.id) : state.exOpen.add(a.dataset.id);
      renderEx();
      return;
    case 'f-origin': f.origin = v; break;
    case 'f-alliance': f.alliance = f.alliance === v ? 'all' : v; break;
    case 'f-toggle': f[v] = !f[v]; break;
    case 'more': state.limit += 60; break;
    case 'set-lang': prefs.lang = v; break;
    case 'set-theme': prefs.theme = v; applyTheme(); break;
    case 'set-boost': prefs.skyteamBoost = v; break;
    case 'q-ow': state.quick.ow = !state.quick.ow; break;
    case 'q-from': state.quick.from = v; break;
    case 'refresh': loadData(true); return;
    case 'target': {
      state.tab = 'routes';
      render();
      const input = document.querySelector(`[data-target="${CSS.escape(a.dataset.route)}"]`);
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => input?.focus(), 350);
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
  if (act.startsWith('f-') || act === 'more') {
    if (act !== 'more') state.limit = 60;
  }
  savePrefs();
  render();
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.f) {
    prefs.filters[el.dataset.f] = el.value;
    state.limit = 60;
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

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.ex-row')) {
    e.preventDefault();
    e.target.click();
  }
});

// Hide airline logos that fail to load.
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
applyTheme();
setLang(prefs.lang);
render();
loadData();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
