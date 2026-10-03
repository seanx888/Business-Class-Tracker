// Routes → 搜尋 (Search): one form that finds flights right now AND sets up a tracker for them.
//
//   • round trip / one way / multi-city (up to five legs: stopovers, open-jaws, "interline" tricks)
//   • cabin (business by default), stops, alliance, airlines, passengers, bags, longest trip
//   • "追蹤這個搜尋" turns the very same form into a Real Tracker (target price, flexible dates, alerts, country check)
//   • live results (Google Flights through /api/search — needs sign-in) or, without it, one-tap links to Google Flights / KAYAK / Skyscanner
//   • "where is it cheapest to pay?": free links per country, and a live comparison of the same flights
import { t, getLang, countryName } from '../i18n.js';
import { icon } from '../icons.js';
import { rankDeals } from '../core/scoring.js';
import { AIRPORTS } from '../core/airports.js';
import { AIRLINES } from '../core/airlines.js';
import { resolvePlaces, placeLabel } from '../core/places.js';
import { encodeSearch, decodeSearch, routeSegments, itineraryLine, CABINS, MAX_SEGS, MAX_PAX, ALLIANCE_KEYS, shiftDate, validDate } from '../core/search.js';
import { googleSearchUrl, searchLinksFor, marketLinks } from '../core/links.js';
import { POS_MARKETS, HOME_MARKET } from '../core/markets.js';
import { MAX_FLEX } from '../core/trackers.js';
import { esc, segmented, chip, notice } from './kit.js';
import { money, city, carrierLabel } from './fmt.js';
import { dealCard, dealDetail, posRows, caveats, allianceMark, tripOf } from './deal.js';
import { onClick, onField } from './registry.js';
import {
  blankForm, formFromSearch, formFromTracker, switchTrip, addSeg, removeSeg, setSeg, bumpPax, paxTotal, addAirline, buildSearch, trackerFromForm,
  trackCost, searchCost, verifyCount, sortDeals, suggestTarget, FLEX_CHOICES, RESULT_SORTS, PAX,
} from './search-model.js';

const FORM_KEY = 'aether.search.v1';
const API = 'api/search';
const MAX_HOURS = [0, 10, 14, 18, 24, 30];

const host = {
  today: () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
  refresh: () => {},          // re-draw the Routes tab if the search view is showing
  toast: () => {},
  go: () => {},
  signedIn: () => false,      // signed in and past the forced password change
  requireSignIn: () => {},    // open the sign-in window
  sessionExpired: () => {},
  people: () => [],
  myNotify: () => 'all',
  capName: (n) => String(n || ''),
  commitTracker: async () => ({ ok: false }),
  skyteamBoost: () => 'standard',
};
/** @param {Partial<typeof host>} h */
export const bindSearch = (h) => Object.assign(host, h);

// ───────────────────────── state ─────────────────────────
const S = {
  form: null,
  err: null, // { error, field }
  cap: { configured: null }, // is live search set up on the server?
  run: { status: 'idle' }, // idle · busy · links (no live search) · error
  results: null, // { search, deals, found, excluded, insights, quota, searches, at }
  open: new Set(),
  sort: 'price',
  cmp: { markets: new Set(POS_MARKETS.map((m) => m.country)), busy: null, step: 0, total: 0, done: new Map(), err: null },
  working: new Set(), // deal ids with a request in flight
  saved: null, // { synced, label } after a tracker was made
  loaded: '',
};

/** A new form: notifications go to whoever is signed in. */
const fresh = (over = {}) => blankForm(host.today(), { notify: host.myNotify(), ...over });

function persist() {
  try {
    const rest = { ...S.form };
    delete rest.id;
    delete rest.created;
    localStorage.setItem(FORM_KEY, JSON.stringify(rest));
  } catch {
    /* private mode */
  }
}

function restore() {
  const base = fresh();
  try {
    const saved = JSON.parse(localStorage.getItem(FORM_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return base;
    const f = { ...base, ...saved, track: false, id: null, created: null };
    const today = host.today();
    // A saved search whose dates have passed starts over with fresh dates (keeping the places and filters).
    if (!validDate(f.depart) || f.depart <= today) Object.assign(f, { depart: base.depart, return: base.return });
    if (!Array.isArray(f.segs) || f.segs.length < 2 || f.segs.some((s) => !validDate(s.date) || s.date <= today)) f.segs = base.segs.map((s, i) => ({ ...s, o: i === 0 ? f.o : f.segs?.[i]?.o ?? s.o, d: i === 0 ? f.d : f.segs?.[i]?.d ?? s.d }));
    return f;
  } catch {
    return base;
  }
}

const form = () => (S.form ||= restore());
const setForm = (f) => {
  S.form = f;
  persist();
};

// ───────────────────────── live search availability ─────────────────────────
export async function pingSearch() {
  if (S.cap.configured !== null) return;
  try {
    const res = await fetch(`${API}?ping=1`, { cache: 'no-store' });
    const ok = res.ok && (res.headers.get('content-type') || '').includes('json');
    S.cap.configured = ok ? !!(await res.json()).configured : false;
  } catch {
    S.cap.configured = false;
  }
  host.refresh();
}

const liveState = () => (S.cap.configured === false ? 'off' : !host.signedIn() ? 'signin' : 'ready');

function errorCode(status, data) {
  if (status === 401) return 'auth';
  if (status === 403) return data.error === 'password-change-required' ? 'mustchange' : 'origin';
  if (status === 501) return 'off';
  if (status === 429) return ['quota-reserve', 'quota-exhausted', 'rate-limited'].includes(data.error) ? data.error : 'rate-limited';
  if (status === 400 || status === 413) return 'invalid';
  if (status === 503) return 'auth-store';
  if (status === 502) return 'provider';
  return 'error';
}

async function api(body) {
  let res;
  try {
    res = await fetch(API, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = errorCode(res.status, data);
    if (code === 'auth') host.sessionExpired();
    throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code, data });
  }
  return data;
}

// ───────────────────────── form pieces ─────────────────────────
export function airportList() {
  return `<datalist id="ap-list">${Object.entries(AIRPORTS).map(([c, a]) => `<option value="${c}">${esc(city(c))} · ${esc(a.en)}</option>`).join('')}</datalist>
    <datalist id="al-list">${Object.entries(AIRLINES).map(([c, a]) => `<option value="${c}">${esc(a.zh)} · ${esc(a.en)}</option>`).join('')}</datalist>`;
}

function placeHint(text) {
  const v = String(text || '').trim();
  if (!v) return { cls: '', text: '' };
  const r = resolvePlaces(v);
  if (r.error) return { cls: ' bad', text: t(`sErr_${r.error}`) };
  return { cls: '', text: `${r.codes.join(' · ')} — ${placeLabel(r.codes, getLang())}` };
}

function placeField(id, label, value, field, ph) {
  const h = placeHint(value);
  return `<div class="field place"><label for="${id}">${esc(label)}</label>
    <input id="${id}" type="text" data-sf="${field}" list="ap-list" value="${esc(value)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(ph)}">
    <small class="hint${h.cls}" data-hint="${field}">${esc(h.text)}</small></div>`;
}

const dateField = (id, label, value, field, min, disabled = false) =>
  `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" type="date" data-sf="${field}" min="${esc(min)}" value="${esc(value)}"${disabled ? ' disabled' : ''}></div>`;

function legsHtml(f, today) {
  const full = f.segs.length >= MAX_SEGS;
  return `<ol class="legs">${f.segs.map((s, i) => `
    <li class="leg">
      <div class="leg-head"><b>${esc(t('legN', { n: i + 1 }))}</b>
        ${f.segs.length > 2 ? `<button type="button" class="icon-btn sm" data-act="s-seg-del" data-v="${i}" aria-label="${esc(t('sLegDel', { n: i + 1 }))}">${icon('x', { size: 18 })}</button>` : ''}</div>
      <div class="grid2">
        ${placeField(`sf-s${i}o`, t('from'), s.o, `seg.${i}.o`, 'TPE · 台北')}
        ${placeField(`sf-s${i}d`, t('to'), s.d, `seg.${i}.d`, 'FCO · Rome')}
      </div>
      <div class="grid2">${dateField(`sf-s${i}t`, t('sDate'), s.date, `seg.${i}.date`, i ? f.segs[i - 1].date || today : today)}<span></span></div>
    </li>`).join('')}</ol>
    <div class="links leg-actions">
      <button type="button" class="btn" data-act="s-seg-add" ${full ? 'disabled' : ''}>${icon('plus', { size: 16 })}${esc(t('sLegAdd'))}</button>
      <button type="button" class="btn quiet" data-act="s-seg-home" ${full ? 'disabled' : ''}>${esc(t('sLegHome'))}</button>
      <span class="small muted">${esc(t('sLegCount', { n: f.segs.length, m: MAX_SEGS }))}</span>
    </div>
    <p class="small muted">${esc(t('sMultiHelp'))}</p>`;
}

function routeBlock(f, today) {
  if (f.trip === 'mc') return legsHtml(f, today);
  return `
    <div class="route-grid">
      ${placeField('sf-o', t('from'), f.o, 'o', 'TPE · 台北')}
      <button type="button" class="icon-btn swap" data-act="s-swap" aria-label="${esc(t('sSwap'))}">${icon('arrows-left-right', { size: 20 })}</button>
      ${placeField('sf-d', t('to'), f.d, 'd', 'CDG · Paris')}
    </div>
    <div class="grid2 form-row">
      ${dateField('sf-dep', t('depart'), f.depart, 'depart', today)}
      ${dateField('sf-ret', t('ret'), f.trip === 'rt' ? f.return : '', 'return', f.depart || today, f.trip !== 'rt')}
    </div>`;
}

function airlineChips(f) {
  const picked = f.airlines.map((c) => `<span class="chip pick" data-code="${esc(c)}">${esc(c)} ${esc(carrierLabel(c))}<button type="button" data-act="s-airline-del" data-v="${esc(c)}" aria-label="${esc(t('sAirlineDel', { a: carrierLabel(c) }))}">${icon('x', { size: 14 })}</button></span>`).join('');
  return `<div class="chips">${picked}</div>
    <div class="field"><input type="text" data-sf="airlineInput" list="al-list" placeholder="${esc(t('sAirlinePh'))}" aria-label="${esc(t('sAirlines'))}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`;
}

function stepper(f, key, label, sub = '') {
  return `<div class="step-row"><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
    <span class="stepper"><button type="button" class="icon-btn sm" data-act="s-pax" data-v="${key}:-1" aria-label="${esc(label)} −" ${(key === 'adults' ? f[key] <= 1 : !f[key]) ? 'disabled' : ''}>${icon('minus', { size: 18 })}</button>
      <b class="num" aria-live="polite">${f[key]}</b>
      <button type="button" class="icon-btn sm" data-act="s-pax" data-v="${key}:1" aria-label="${esc(label)} +" ${paxTotal(f) >= MAX_PAX ? 'disabled' : ''}>${icon('plus', { size: 18 })}</button></span></div>`;
}

function moreBlock(f) {
  const n = [paxTotal(f) > 1, f.bags > 0, !!f.maxHours].filter(Boolean).length;
  return `<details class="more" ${n ? 'open' : ''}><summary>${icon('sliders-horizontal', { size: 16 })}${esc(t('sMore'))}${n ? ` <span class="count">${n}</span>` : ''}</summary>
    <div class="more-body">
      ${stepper(f, 'adults', t('sPaxAdults'), t('sPaxAdultsSub'))}
      ${stepper(f, 'children', t('sPaxChildren'), t('sPaxChildrenSub'))}
      ${stepper(f, 'infantsSeat', t('sPaxInfantSeat'), t('sPaxInfantSeatSub'))}
      ${stepper(f, 'infantsLap', t('sPaxInfantLap'), t('sPaxInfantLapSub'))}
      <div class="form-row"><span class="field-label">${esc(t('sBags'))}</span><div class="chips">${[0, 1, 2].map((n2) => chip('s-bags', n2, esc(n2 ? t('sBagsN', { n: n2 }) : t('sBagsAny')), f.bags === n2)).join('')}</div></div>
      <div class="form-row"><span class="field-label">${esc(t('sMaxHours'))}</span><div class="chips">${MAX_HOURS.map((h) => chip('s-hours', h, esc(h ? t('sHoursN', { n: h }) : t('trkStopsAny')), Number(f.maxHours || 0) === h)).join('')}</div></div>
    </div></details>`;
}

function trackPanel(f) {
  const who = host.people();
  const notifyOn = (n) => (n === 'all' ? f.notify === 'all' : Array.isArray(f.notify) && f.notify.includes(n));
  const cost = trackCost(f);
  return `<div class="trk-panel${f.track ? ' on' : ''}" id="trk-panel">
    <label class="switch"><input type="checkbox" data-sf="track" ${f.track ? 'checked' : ''}><span class="knob" aria-hidden="true"></span>
      <span class="sw-text"><b>${icon('target', { size: 16 })} ${esc(t(f.id ? 'sTrackEditing' : 'sTrackOn'))}</b><small>${esc(t('sTrackSub'))}</small></span></label>
    ${f.track ? `
      <div class="field form-row"><label for="sf-target">${esc(t('trkTarget'))}</label>
        <input id="sf-target" type="number" inputmode="numeric" min="0" step="1000" data-sf="target" value="${esc(f.target)}" placeholder="${esc(t('sTargetPh'))}"></div>
      <div class="form-row"><span class="field-label">${esc(t('sFlexLbl'))}</span>
        <div class="chips">${chip('s-mode', 'fixed', esc(t('trkFixed')), f.mode !== 'flex')}${FLEX_CHOICES.filter((n) => n <= MAX_FLEX).map((n) => chip('s-flex', n, esc(t('trkFlexN', { n })), f.mode === 'flex' && Number(f.flex) === n)).join('')}</div>
        ${f.trip === 'mc' && f.mode === 'flex' ? `<p class="small muted">${esc(t('sFlexMc'))}</p>` : ''}</div>
      <div class="form-row"><span class="field-label">${esc(t('trkAlert'))}</span><div class="chips">${chip('s-alert', 'drop', esc(t('trkAlertDrop')), f.alertOn !== 'any')}${chip('s-alert', 'any', esc(t('trkAlertAny')), f.alertOn === 'any')}</div></div>
      ${who.length ? `<div class="form-row"><span class="field-label">${esc(t('trkNotify'))}</span><div class="chips">${chip('s-notify', 'all', esc(t('trkNotifyAll')), notifyOn('all'))}${who.map((n) => chip('s-notify', n, esc(host.capName(n)), notifyOn(n))).join('')}</div></div>` : ''}
      <label class="check form-row"><input type="checkbox" data-sf="pos" ${f.pos ? 'checked' : ''}><span><b>${esc(t('sPosTrack'))}</b><br><small>${esc(t('sPosTrackSub'))}</small></span></label>
      <div class="field form-row"><label for="sf-label">${esc(t('trkLabel'))}</label><input id="sf-label" type="text" data-sf="label" maxlength="60" value="${esc(f.label)}" placeholder="${esc(t('trkLabelPh'))}"></div>
      <p class="small muted form-row">${icon('info', { size: 14 })} ${esc(t('trkCost', { n: cost.perDay, c: cost.combos }))}${f.mode === 'flex' ? ` ${esc(t('trkCostFlex', { d: cost.days }))}` : ''}</p>` : ''}
  </div>`;
}

function errorNotice() {
  const e = S.err;
  if (!e) return '';
  return notice(t(`sErr_${e.error}`), true);
}

function linksBlock(built) {
  if (built.error) return '';
  const s = built.search;
  const lang = getLang();
  const links = searchLinksFor(s, { lang, currency: 'TWD' });
  const rows = marketLinks(s, [HOME_MARKET, ...POS_MARKETS], { lang });
  return `
    <div class="sec outlinks"><h4>${esc(t('sOpenIn'))}</h4>
      <div class="links">${links.map((l, i) => `<a class="btn${i === 0 ? '' : ''}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}${icon('arrow-square-out', { size: 16 })}</a>`).join('')}
        <button type="button" class="btn quiet" data-act="s-copy-link">${icon('link', { size: 16 })}${esc(t('sCopyLink'))}</button></div></div>
    <details class="caveats"><summary>${icon('globe-hemisphere-east', { size: 16 })}${esc(t('sCountryCheck'))}</summary>
      <p class="small muted">${esc(t('sCountryCheckHelp'))}</p>
      <div class="pos-list">${rows.map((m) => `<a class="pos-row" href="${esc(m.url)}" target="_blank" rel="noopener">
        <span class="cc">${esc(m.country)}</span><span class="who">${esc(m.country === 'TW' ? t('posHome') : t('posMarket', { c: countryName(m.country) }))}<small>${esc(m.currency)}</small></span>
        <span class="val">${icon('arrow-square-out', { size: 16 })}</span></a>`).join('')}</div>
      <ul class="plain small muted">${t('posCaveats').map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
}

// ───────────────────────── the page ─────────────────────────
export function searchHtml() {
  const f = form();
  const today = host.today();
  const built = buildSearch(f, { today });
  const live = liveState();
  const editing = !!f.id;
  const label = editing ? t('sUpdate') : f.track ? t('sSearchTrack') : t('sSearch');
  const busy = S.run.status === 'busy';
  return `
    ${airportList()}
    <p class="intro">${esc(t('sIntro'))}</p>
    ${S.saved ? `<div class="notice good">${icon('check')}<span>${esc(t(S.saved.synced ? 'sSavedSynced' : 'sSavedLocal'))} <button type="button" class="linkish" data-act="s-goto-track">${esc(t('sGotoTrack'))}</button></span></div>` : ''}
    <section class="panel sform" id="sform">
      ${segmented('s-trip', [['rt', t('rt')], ['ow', t('ow')], ['mc', t('sMulti')]], f.trip, t('sTrip'))}
      <div class="form-row">${routeBlock(f, today)}</div>
      <div class="form-row"><span class="field-label">${esc(t('trkCabin'))}</span><div class="chips">${CABINS.map((c) => chip('s-cabin', c, esc(t(`cabin_${c}`)), f.cabin === c)).join('')}</div></div>
      <div class="form-row"><span class="field-label">${esc(t('trkStops'))}</span><div class="chips">${[['any', t('trkStopsAny')], ['0', t('nonstopOnly')], ['1', t('trkStops1')], ['2', t('sStops2')]].map(([v, l]) => chip('s-stops', v, esc(l), String(f.maxStops ?? 'any') === v)).join('')}</div></div>
      <div class="form-row"><span class="field-label">${esc(t('allianceLbl'))}</span><div class="chips">${chip('s-alliance', 'any', esc(t('allAlliances')), !f.alliance)}${ALLIANCE_KEYS.map((a) => chip('s-alliance', a, allianceMark(a), f.alliance === a)).join('')}</div></div>
      <div class="form-row"><span class="field-label">${esc(t('sAirlines'))}</span>${airlineChips(f)}${f.alliance && f.airlines.length ? `<p class="small muted">${esc(t('sUnion'))}</p>` : ''}</div>
      <div class="form-row">${moreBlock(f)}</div>
      <div class="form-row">${trackPanel(f)}</div>
      ${S.err ? `<div class="form-row">${errorNotice()}</div>` : ''}
      <div class="form-actions sform-actions">
        <button type="button" class="btn primary" data-act="s-run" ${busy ? 'disabled' : ''}>${icon(editing ? 'check' : 'magnifying-glass', { size: 18 })}${esc(label)}</button>
        ${f.track && !editing ? `<button type="button" class="btn" data-act="s-save">${icon('target', { size: 16 })}${esc(t('sTrackOnly'))}</button>` : ''}
        ${editing ? `<button type="button" class="btn quiet" data-act="s-cancel">${esc(t('cancel'))}</button>` : ''}
      </div>
      ${live !== 'ready' && S.cap.configured !== null ? `<p class="small muted form-row">${icon('info', { size: 14 })} ${esc(t(live === 'off' ? 'sLiveOff' : 'sLiveSignin'))}</p>` : ''}
      <div class="form-row">${linksBlock(built)}</div>
    </section>
    <div id="sres">${resultsHtml()}</div>`;
}

// ───────────────────────── results ─────────────────────────
function insightLine(i) {
  if (!i) return '';
  const bits = [];
  if (i.level) {
    const l = t(`lvl_${i.level}`);
    bits.push(`${t('googleLevel')}: ${l.startsWith('lvl_') ? i.level : l}`);
  }
  if (Array.isArray(i.typicalRange) && i.typicalRange.length === 2) bits.push(t('sTypical', { a: money(i.typicalRange[0]), b: money(i.typicalRange[1]) }));
  return bits.length ? `<p class="small muted">${icon('info', { size: 14 })} ${esc(bits.join(' · '))}</p>` : '';
}

function resultsHtml() {
  const run = S.run;
  if (run.status === 'busy') {
    return `<div class="searching" role="status">${icon('airplane-tilt', { size: 22 })}<span>${esc(t('sSearching'))}</span></div><div class="skeleton"></div><div class="skeleton"></div>`;
  }
  if (run.status === 'error') return notice(t(`sRunErr_${run.code}`), true);
  if (!S.results) return '';
  const r = S.results;
  if (!r.deals) {
    // No live search here: the free links are the result.
    const built = { search: r.search };
    return `<h2>${esc(t('sLinksTitle'))}</h2><p class="small muted">${esc(t(liveState() === 'signin' ? 'sLiveSignin' : 'sLiveOff'))}</p><section class="panel">${linksBlock(built)}</section>`;
  }
  const list = sortDeals(r.deals, S.sort);
  const lowest = r.deals.length ? Math.min(...r.deals.map((d) => d.priceTWD)) : null;
  const head = `
    <h2>${esc(t('sResults'))}${lowest ? ` <span class="num">${money(lowest)}</span>` : ''}</h2>
    <p class="small muted">${esc(itineraryLine(r.search))} · ${esc(t('sFound', { n: r.deals.length }))}${r.excluded ? ` · ${icon('shield-check', { size: 14 })} ${esc(t('sExcluded', { n: r.excluded }))}` : ''}${r.quota ? ` · ${esc(t('sQuota', { n: r.quota.left }))}` : ''}</p>
    ${insightLine(r.insights)}`;
  if (!list.length) return `${head}<div class="empty">${esc(t('sNone'))}</div>`;
  return `${head}
    <div class="chips" role="group" aria-label="${esc(t('sort'))}">${RESULT_SORTS.map((k) => chip('s-sort', k, esc(t(`sSort_${k}`)), S.sort === k)).join('')}</div>
    <div class="list s-list">${list.map(cardHtml).join('')}</div>`;
}

function cardHtml(d) {
  const tags = [];
  const mc = tripOf(d) === 'mc';
  if (mc && (d.legs || []).length < (d.legCount || 0)) tags.push(`<span class="tag warn">${esc(t('sPartial', { n: (d.legs || []).length, m: d.legCount }))}</span>`);
  let html = dealCard(d, { act: 's-toggle', tags });
  if (S.open.has(d.id)) {
    html = html.replace('<div class="deal-detail" hidden></div>', `<div class="deal-detail">${detailHtml(d)}</div>`).replace('aria-expanded="false"', 'aria-expanded="true"');
  }
  return html;
}

function actionsFor(d) {
  const r = S.results;
  const legs = routeSegments(r.search).length;
  const missing = (d.legCount || legs) - (d.legs || []).length;
  const busy = S.working.has(d.id);
  const c = S.cmp;
  const n = [...c.markets].length;
  const comparing = c.busy === d.id;
  return `
    <button type="button" class="btn block" data-act="s-track-deal" data-id="${esc(d.id)}">${icon('target', { size: 16 })}${esc(t('sTrackThis'))}</button>
    ${missing > 0 && d.token ? `<button type="button" class="btn block" data-act="s-complete" data-id="${esc(d.id)}" ${busy ? 'disabled' : ''}>${icon('airplane-tilt', { size: 16 })}${esc(busy ? t('sCompleting') : t('sComplete', { n: missing }))}</button>` : ''}
    <button type="button" class="btn block" data-act="s-compare" data-id="${esc(d.id)}" ${comparing || !n ? 'disabled' : ''}>${icon('globe-hemisphere-east', { size: 16 })}${esc(comparing ? t('sComparing', { i: c.step, n: c.total }) : t('sCompare', { n }))}</button>
    <details class="caveats cmp"><summary>${esc(t('sPickCountries'))}</summary>
      <div class="chips">${POS_MARKETS.map((m) => chip('s-cmp-market', m.country, esc(countryName(m.country)), c.markets.has(m.country))).join('')}</div></details>
    ${c.err && c.err.id === d.id ? notice(t(`sRunErr_${c.err.code}`), true) : ''}`;
}

function posSection(d) {
  const done = S.cmp.done.get(d.id);
  if (!done) return '';
  const search = S.results.search;
  const markets = done.markets.map((m) => ({ ...m, url: googleSearchUrl(search, { lang: getLang(), currency: m.currency, gl: m.country }) }));
  const none = done.none.length ? `<p class="small muted">${esc(t('sCmpNone', { list: done.none.map(countryName).join(' · ') }))}</p>` : '';
  const best = markets.filter((m) => m.savingsPct >= 3).sort((a, b) => b.savingsPct - a.savingsPct)[0];
  const verdict = best
    ? `<p class="verdict good">${icon('trend-down', { size: 16 })} ${esc(t('sCmpBest', { c: countryName(best.country), v: money(best.savingsTWD), p: Math.round(best.savingsPct) }))}</p>`
    : `<p class="verdict">${icon('info', { size: 16 })} ${esc(t('sCmpHome'))}</p>`;
  return `<div class="sec"><h4>${esc(t('posSection'))}</h4>${verdict}${posRows({ ...d, pos: { markets } })}${none}${caveats()}</div>`;
}

function detailHtml(d) {
  return dealDetail(d, { search: S.results.search, actions: actionsFor(d), posHtml: posSection(d) });
}

function refreshCard(id) {
  const card = document.getElementById(`deal-${id}`);
  const d = S.results?.deals?.find((x) => x.id === id);
  if (!card || !d) return host.refresh();
  const det = card.querySelector('.deal-detail');
  if (S.open.has(id)) {
    det.innerHTML = detailHtml(d);
    det.hidden = false;
  }
  // price / tags may have changed (a completed trip)
  const fresh = document.createElement('div');
  fresh.innerHTML = cardHtml(d);
  const main = fresh.querySelector('.deal-main');
  if (main) card.querySelector('.deal-main').innerHTML = main.innerHTML;
  return undefined;
}

// ───────────────────────── actions ─────────────────────────
function scrollToResults() {
  requestAnimationFrame(() => document.getElementById('sres')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
}

function showError(e) {
  S.err = e;
  host.refresh();
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-sf="${e.field}"]`) || document.querySelector('#sform .notice');
    el?.scrollIntoView({ block: 'center' });
    if (el && el.focus) el.focus({ preventScroll: true });
  });
}

/** Save the form as a tracker. Returns true when it was saved (on this device at least). */
async function saveTracker() {
  const f = form();
  const { tracker, error, field } = trackerFromForm(f, { today: host.today() });
  if (error) {
    showError({ error, field });
    return false;
  }
  S.err = null;
  const res = await host.commitTracker(tracker);
  setForm({ ...f, id: null, created: null, track: false });
  S.saved = { synced: !!res.ok, label: tracker.label };
  host.refresh();
  return true;
}

async function runSearch({ track = false } = {}) {
  const f = form();
  const built = buildSearch(f, { today: host.today() });
  if (built.error) return showError(built);
  S.err = null;
  S.saved = null;
  const editing = !!f.id;
  if (editing || track) {
    if (!(await saveTracker())) return undefined;
    if (editing) return undefined; // updating a tracker does not need a fresh search
  }
  const state = liveState();
  S.cmp.done.clear();
  S.open.clear();
  if (state !== 'ready') {
    S.results = { search: built.search, deals: null };
    S.run = { status: 'links' };
    if (state === 'signin' && S.cap.configured) host.requireSignIn();
    host.refresh();
    scrollToResults();
    return undefined;
  }
  const legs = routeSegments(built.search).length;
  const verify = verifyCount(legs);
  S.run = { status: 'busy' };
  S.results = null;
  host.refresh();
  scrollToResults();
  try {
    const res = await api({ op: 'search', search: built.search, verify });
    const deals = rankDeals(res.deals || [], 'price', { skyteamBoost: host.skyteamBoost() });
    S.results = { search: built.search, deals, found: res.found, excluded: res.excluded || 0, insights: res.insights || null, quota: res.quota || null, searches: res.searches || 0, at: res.generatedAt, cost: searchCost(legs, verify) };
    S.run = { status: 'done' };
  } catch (e) {
    S.run = { status: 'error', code: e.code || 'error' };
  }
  host.refresh();
  return undefined;
}

async function completeDeal(id) {
  const r = S.results;
  const d = r?.deals?.find((x) => x.id === id);
  if (!d || S.working.has(id)) return;
  S.working.add(id);
  refreshCard(id);
  try {
    const res = await api({ op: 'complete', search: r.search, token: d.token, firstLeg: d.legs[0], price: d.price });
    if (!res.ok) {
      r.deals = r.deals.filter((x) => x.id !== id);
      S.open.delete(id);
      host.toast(t('sDroppedChina'), 5000);
      S.working.delete(id);
      host.refresh();
      return;
    }
    Object.assign(d, { legs: res.legs, price: res.price, priceTWD: res.priceTWD, inboundVerified: !!res.complete });
    r.deals = rankDeals(r.deals, 'price', { skyteamBoost: host.skyteamBoost() });
  } catch (e) {
    host.toast(t(`sRunErr_${e.code || 'error'}`), 5000);
  }
  S.working.delete(id);
  host.refresh();
}

async function compareDeal(id) {
  const r = S.results;
  const d = r?.deals?.find((x) => x.id === id);
  const c = S.cmp;
  if (!d || c.busy) return;
  const markets = POS_MARKETS.filter((m) => c.markets.has(m.country));
  if (!markets.length) return;
  if (!confirm(t('sCompareAsk', { n: markets.length }))) return;
  c.busy = id;
  c.err = null;
  c.total = markets.length;
  c.step = 0;
  const found = [];
  const none = [];
  S.open.add(id);
  refreshCard(id);
  for (const m of markets) {
    c.step += 1;
    refreshCard(id);
    try {
      const res = await api({ op: 'pos', search: r.search, market: m.country, legs: d.legs, carrier: d.primaryCarrier, priceTWD: d.priceTWD });
      if (res.market) found.push(res.market);
      else none.push(m.country);
    } catch (e) {
      c.err = { id, code: e.code || 'error' };
      if (['quota-reserve', 'quota-exhausted', 'rate-limited', 'auth', 'network', 'off'].includes(e.code)) break;
      none.push(m.country);
    }
    c.done.set(id, { markets: [...found].sort((a, b) => a.priceTWD - b.priceTWD), none: [...none] });
  }
  c.busy = null;
  c.done.set(id, { markets: found.sort((a, b) => a.priceTWD - b.priceTWD), none });
  refreshCard(id);
}

function trackFromDeal(id) {
  const r = S.results;
  const d = r?.deals?.find((x) => x.id === id);
  if (!d) return;
  // The tracker watches the search that found the result (not just this one flight), so the form is set back to that search.
  const f = formFromSearch(r.search, form());
  setForm({ ...f, track: true, target: suggestTarget(d.priceTWD), id: null, created: null });
  S.err = null;
  S.saved = null;
  host.refresh();
  requestAnimationFrame(() => {
    const panel = document.getElementById('trk-panel');
    panel?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    document.getElementById('sf-target')?.focus({ preventScroll: true });
  });
  host.toast(t('sTrackFilled'), 4500);
}

/** Open the search view with this search in the form. `run` searches straight away (when live search is ready). */
export function openSearch({ search = null, fields = null, track = false, run = false } = {}) {
  let f = search ? formFromSearch(search, fresh()) : { ...fresh(), ...(fields || {}) };
  if (search && fields) f = { ...f, ...fields };
  f = { ...f, track, id: null, created: null };
  setForm(f);
  S.err = null;
  S.saved = null;
  S.results = null;
  S.run = { status: 'idle' };
  host.go('#routes');
  host.refresh();
  window.scrollTo({ top: 0 });
  if (run && liveState() === 'ready') runSearch();
}

export function editTracker(tr) {
  setForm(formFromTracker(tr, host.today()));
  S.err = null;
  S.saved = null;
  S.results = null;
  host.go('#routes');
  host.refresh();
  requestAnimationFrame(() => document.getElementById('sform')?.scrollIntoView({ block: 'start' }));
}

/** A search shared as `#routes/search?s=…`: fill the form once per distinct link. */
export function loadParam(param) {
  if (!param || param === S.loaded) return;
  S.loaded = param;
  const { search, error } = decodeSearch(param);
  if (error) return;
  setForm({ ...formFromSearch(search, fresh()), track: false, id: null, created: null });
  S.results = null;
  S.run = { status: 'idle' };
  S.err = null;
}

export const currentSearch = () => buildSearch(form(), { today: host.today() }).search || null;

// ── clicks ──
function reform(fn) {
  setForm(fn(form()));
  S.err = null;
  S.saved = null;
  host.refresh();
}

onClick({
  's-trip': (el) => reform((f) => switchTrip(f, el.dataset.v)),
  's-cabin': (el) => reform((f) => ({ ...f, cabin: el.dataset.v })),
  's-stops': (el) => reform((f) => ({ ...f, maxStops: el.dataset.v === 'any' ? null : Number(el.dataset.v) })),
  's-alliance': (el) => reform((f) => ({ ...f, alliance: el.dataset.v === 'any' ? null : el.dataset.v })),
  's-bags': (el) => reform((f) => ({ ...f, bags: Number(el.dataset.v) })),
  's-hours': (el) => reform((f) => ({ ...f, maxHours: Number(el.dataset.v) || '' })),
  's-pax': (el) => {
    const [key, delta] = el.dataset.v.split(':');
    if (PAX.includes(key)) reform((f) => bumpPax(f, key, Number(delta)));
  },
  's-swap': () => reform((f) => (f.trip === 'mc' ? f : { ...f, o: f.d, d: f.o })),
  's-seg-add': () => reform((f) => addSeg(f)),
  's-seg-home': () => reform((f) => addSeg(f, { backHome: true })),
  's-seg-del': (el) => reform((f) => removeSeg(f, Number(el.dataset.v))),
  's-airline-del': (el) => reform((f) => ({ ...f, airlines: f.airlines.filter((c) => c !== el.dataset.v) })),
  's-mode': () => reform((f) => ({ ...f, mode: 'fixed' })),
  's-flex': (el) => reform((f) => ({ ...f, mode: 'flex', flex: Number(el.dataset.v) })),
  's-alert': (el) => reform((f) => ({ ...f, alertOn: el.dataset.v })),
  's-notify': (el) => reform((f) => {
    const v = el.dataset.v;
    if (v === 'all') return { ...f, notify: 'all' };
    const cur = new Set(Array.isArray(f.notify) ? f.notify : []);
    if (cur.has(v)) cur.delete(v);
    else cur.add(v);
    return { ...f, notify: cur.size ? [...cur] : 'all' };
  }),
  's-run': () => runSearch({ track: form().track }),
  's-save': () => saveTracker(),
  's-cancel': () => {
    setForm({ ...fresh(), ...form(), id: null, created: null, track: false });
    host.refresh();
  },
  's-goto-track': () => {
    S.saved = null;
    host.go('#routes/track');
  },
  's-toggle': (el) => {
    const id = el.dataset.id;
    const card = el.closest('.deal');
    const d = S.results?.deals?.find((x) => x.id === id);
    if (!card || !d) return;
    const det = card.querySelector('.deal-detail');
    const show = det.hidden;
    if (show) {
      S.open.add(id);
      det.innerHTML = detailHtml(d);
    } else S.open.delete(id);
    det.hidden = !show;
    el.setAttribute('aria-expanded', String(show));
  },
  's-sort': (el) => {
    S.sort = el.dataset.v;
    host.refresh();
  },
  's-complete': (el) => completeDeal(el.dataset.id),
  's-compare': (el) => compareDeal(el.dataset.id),
  's-cmp-market': (el) => {
    const c = el.dataset.v;
    const set = S.cmp.markets;
    if (set.has(c)) set.delete(c);
    else set.add(c);
    const card = el.closest('.deal');
    const id = card?.id.replace(/^deal-/, '');
    if (!id) return;
    refreshCard(id);
    card.querySelector('details.cmp')?.setAttribute('open', ''); // the picker stays open while countries are ticked
    const ch = card.querySelector(`details.cmp [data-v="${c}"]`);
    ch?.focus({ preventScroll: true });
  },
  's-track-deal': (el) => trackFromDeal(el.dataset.id),
  's-copy-link': async () => {
    const s = buildSearch(form(), { today: host.today() }).search;
    if (!s) return;
    const url = `${location.origin}${location.pathname}#routes/search?s=${encodeSearch(s)}`;
    try {
      await navigator.clipboard.writeText(url);
      host.toast(t('copied'));
    } catch {
      host.toast(url, 8000);
    }
  },
});

// ── typing ──
function syncPlaceHints() {
  document.querySelectorAll('#sform [data-hint]').forEach((h) => {
    const key = h.dataset.hint;
    const input = document.querySelector(`#sform [data-sf="${key}"]`);
    if (!input) return;
    const f = form();
    const value = key.startsWith('seg.') ? f.segs[Number(key.split('.')[1])]?.[key.split('.')[2]] : f[key];
    if (input !== document.activeElement && input.value !== value) input.value = value ?? '';
    const hint = placeHint(value);
    h.className = `hint${hint.cls}`;
    h.textContent = hint.text;
  });
}

function syncDates() {
  const f = form();
  const dep = document.getElementById('sf-dep');
  const ret = document.getElementById('sf-ret');
  if (dep && dep.value !== f.depart) dep.value = f.depart;
  if (ret) {
    ret.min = f.depart;
    if (f.trip === 'rt' && ret.value !== f.return) ret.value = f.return;
  }
  f.segs.forEach((s, i) => {
    const el = document.querySelector(`#sform [data-sf="seg.${i}.date"]`);
    if (el && el.value !== s.date) el.value = s.date;
    if (el && i) el.min = f.segs[i - 1].date || host.today();
  });
}

onField((el, kind) => {
  const key = el.dataset.sf;
  if (!key) return false;
  const f = form();
  const v = el.value;
  if (kind === 'input') {
    if (key === 'o' || key === 'd') S.form = { ...f, [key]: v };
    else if (key === 'depart') S.form = { ...f, depart: v };
    else if (key === 'return') S.form = { ...f, return: v };
    else if (key.startsWith('seg.')) {
      const [, i, k] = key.split('.');
      S.form = setSeg(f, Number(i), k, v);
    } else if (key === 'target' || key === 'label') S.form = { ...f, [key]: v };
    else return true; // airlineInput: handled on change
    persist();
    return true;
  }
  // change (the field lost focus or Enter was pressed)
  if (key === 'airlineInput') {
    const r = addAirline(f.airlines, v);
    el.value = '';
    if (r.error) {
      if (r.error !== 'dup') host.toast(t(`sAirlineErr_${r.error}`), 4500);
      return true;
    }
    if (r.airlines !== f.airlines) reform((g) => ({ ...g, airlines: r.airlines }));
    return true;
  }
  if (key === 'track') {
    setForm({ ...f, track: el.checked });
    S.saved = null;
    host.refresh();
    return true;
  }
  if (key === 'pos') {
    setForm({ ...f, pos: el.checked });
    host.refresh();
    return true;
  }
  if (key === 'depart' && f.trip === 'rt' && !(f.return > v)) setForm({ ...f, depart: v, return: validDate(v) ? shiftDate(v, 7) : f.return });
  else if (key.startsWith('seg.') && key.endsWith('.date')) {
    const i = Number(key.split('.')[1]);
    setForm({ ...f, segs: f.segs.map((s, j) => (j > i && validDate(v) && s.date < v ? { ...s, date: v } : s)), ...(i === 0 ? { depart: v } : {}) });
  }
  syncDates();
  syncPlaceHints();
  return true;
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const key = e.target?.dataset?.sf;
  if (!key || key === 'airlineInput') return;
  e.preventDefault();
  document.querySelector('#sform [data-act="s-run"]')?.click();
});
