// Deals → 社群情報 (deals found on social sources) and 活動 (airline / hotel promotions, status matches), plus
// "paste a post": Facebook / LINE / PTT text can't be read by a program, so a person pastes it and it is read here.
//
// Data: web/data/community.json, written by the daily scan (scripts/community.mjs). Until the first scan the file is
// missing — the screens say so and the paste importer still works.
import { t, getLang, countryName, regionName } from '../i18n.js';
import { icon } from '../icons.js';
import { parsePost, suggestAirports } from '../core/community.js';
import { placeLabel } from '../core/places.js';
import { programName } from '../core/programs.js';
import { relatedToWallet } from '../core/promos.js';
import { esc, chip, tag, notice, ago, skeleton } from './kit.js';
import { money, carrierLabel, fmtDay, fmtWhen, city } from './fmt.js';
import { allianceMark } from './deal.js';
import { onClick, onField } from './registry.js';
import {
  chinaFree, filterDeals, filterPromos, kindCounts, deadline, dealSearchFields, routeFields, readMarks, writeMarks, pickAlerts,
  DEAL_KIND_ORDER, PROMO_KIND_ORDER, PROMO_CATEGORIES, MIN_RELEVANCE,
} from './community-model.js';

const MARKS_KEY = 'aether.community.v1';
const PAGE = 30;

const host = {
  today: () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
  fetchData: async () => {
    throw new Error('not bound');
  },
  refresh: () => {},
  toast: () => {},
  notify: () => {},
  go: () => {},
  members: () => [],
  openSearch: () => {},
  fx: () => null,
};
/** @param {Partial<typeof host>} h */
export const bindCommunity = (h) => Object.assign(host, h);

let marks = readMarks(safeGet());
function safeGet() {
  try {
    return localStorage.getItem(MARKS_KEY);
  } catch {
    return null;
  }
}
function persistMarks() {
  try {
    localStorage.setItem(MARKS_KEY, writeMarks(marks));
  } catch {
    /* private mode */
  }
}

const C = {
  data: null, // { deals, promos, sources, stats, generatedAt, scanDate, dropped } | { missing: true }
  loading: false,
  error: null,
  df: { rel: 'mine', kind: 'all' },
  pf: { rel: 'mine', kind: 'all', cat: 'all' },
  limit: PAGE,
  plimit: PAGE,
  sourcesOpen: false,
  post: { open: false, text: '', result: null, picks: {} },
};

// ───────────────────────── data ─────────────────────────
export async function loadCommunity(force = false) {
  if (C.loading || (C.data && !force)) return;
  C.loading = true;
  try {
    const raw = await host.fetchData('community.json', force);
    const deals = chinaFree(Array.isArray(raw.deals) ? raw.deals : []);
    const promos = chinaFree(Array.isArray(raw.promos) ? raw.promos : []);
    C.data = { ...raw, deals: deals.clean, promos: promos.clean, sources: Array.isArray(raw.sources) ? raw.sources : [], dropped: deals.dropped + promos.dropped };
    C.error = null;
    announce();
  } catch (e) {
    C.data = C.data && !C.data.missing ? C.data : { missing: true, deals: [], promos: [], sources: [], dropped: 0 };
    C.error = e.message;
  }
  C.loading = false;
  host.refresh();
}

/** Tell the person (toast + browser notification, if allowed) about NEW strong items — once per item, on this device. */
function announce() {
  const a = pickAlerts(C.data, { members: host.members(), seen: marks.seen, saved: marks.saved, hidden: marks.hidden });
  const n = a.deals.length + a.promos.length + a.mine.length;
  if (!n) return;
  for (const x of [...a.deals, ...a.promos, ...a.mine]) marks.seen.add(x.id);
  persistMarks();
  const parts = [];
  if (a.mine.length) parts.push(t('cAlertMine', { n: a.mine.length }));
  if (a.deals.length) parts.push(t('cAlertDeals', { n: a.deals.length }));
  if (a.promos.length) parts.push(t('cAlertPromos', { n: a.promos.length }));
  const first = [...a.mine, ...a.deals, ...a.promos][0];
  const body = `${parts.join(' · ')} — ${first.title.slice(0, 90)}`;
  host.toast(body, 7000);
  host.notify(t('appName'), body);
}

/** Summary for Settings: when the feed was last read and which sources work. */
export function communityStatus() {
  const d = C.data;
  if (!d) return null;
  if (d.missing) return { missing: true };
  return { updated: d.generatedAt, deals: d.deals.length, promos: d.promos.length, excluded: (d.dropped || 0) + (d.stats?.excluded?.china || 0), sources: d.sources };
}

/** Promotions about programs the person holds (Members tab). */
export function walletPromosHtml(members) {
  const d = C.data;
  if (!d || d.missing || !members.length) return '';
  const list = filterPromos(d.promos, { rel: 'wallet', kind: 'all', cat: 'all' }, { members, today: host.today(), hidden: marks.hidden }).slice(0, 5);
  if (!list.length) return '';
  return `<section class="panel wallet-promos"><h3>${icon('megaphone', { size: 18 })} ${esc(t('mpTitle'))}</h3>
    <ul class="plain">${list.map(({ p, mine }) => {
    const dl = deadline(p, host.today());
    return `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a><br><span class="small muted">${esc(mine.map(brandName).join(', '))} · ${esc(t(`pkind_${p.kinds[0]}`))}${dl ? ` · ${esc(t('pLeft', { n: dl.days }))}` : ''}</span></li>`;
  }).join('')}</ul>
    <button type="button" class="btn quiet" data-act="mp-all">${esc(t('mpAll'))}</button></section>`;
}

export const communityCounts = () => ({ deals: C.data?.deals?.length ?? null, promos: C.data?.promos?.length ?? null });

// ───────────────────────── shared pieces ─────────────────────────
const REGION_LABELS = {
  'US-E': { 'zh-TW': '美東', en: 'US East', ko: '미국 동부' },
  'US-W': { 'zh-TW': '美西', en: 'US West', ko: '미국 서부' },
  OCNZ: { 'zh-TW': '紐澳', en: 'Australia & NZ', ko: '호주·뉴질랜드' },
  ASIA: { 'zh-TW': '亞洲', en: 'Asia', ko: '아시아' },
};
const regionLabel = (code) => REGION_LABELS[code]?.[getLang()] || regionName(code);

function nodeLabel(n) {
  if (n.kind === 'place') return `${placeLabel(n.code, getLang())}`;
  if (n.kind === 'country') return countryName(n.code);
  return regionLabel(n.code);
}

function stopLabel(r) {
  if (!r) return '';
  if (r.kind === 'place') return `${r.code} ${city(r.code)}`;
  return r.kind === 'country' ? countryName(r.code) : regionLabel(r.code);
}

const kindTags = (kinds, prefix = 'kind_') => kinds.map((k) => tag(t(`${prefix}${k}`), k === 'error-fare' || k === 'status-match' ? 'hot' : k === 'sale' || k === 'fare-sale' ? '' : 'pos')).join('');

function chipRow(act, options, current, label) {
  return `<div class="chips scroll" role="group" aria-label="${esc(label)}">${options.map(([v, text]) => chip(act, v, esc(text), current === v)).join('')}</div>`;
}

function statusLine() {
  const d = C.data;
  if (!d || d.missing) return '';
  const used = d.sources.filter((s) => s.status === 'ok').length;
  return `<div class="status">${icon('shield-check', { size: 16 })}<span>${esc(t('cStatus', { n: d.deals.length + d.promos.length, s: used, t: fmtWhen(d.generatedAt) }))}${d.dropped || d.stats?.excluded?.china ? ` · ${esc(t('cDropped', { n: (d.dropped || 0) + (d.stats?.excluded?.china || 0) }))}` : ''}</span></div>`;
}

function sourcesHtml() {
  const d = C.data;
  if (!d || d.missing || !d.sources.length) return '';
  const open = C.sourcesOpen;
  const bad = d.sources.filter((s) => s.status === 'blocked' || s.status === 'error').length;
  const rows = open ? d.sources.map((s) => `
      <li class="src src-${esc(s.status)}">
        <span class="status-pill s-${esc(s.status)}">${esc(t(`cSrc_${s.status}`))}</span>
        <span class="src-main"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>
          <small>${s.status === 'ok' ? esc(t('cSrcCounts', { n: s.items ?? 0, d: s.deals ?? 0, p: s.promos ?? 0 })) : esc(s.note || s.error || '')}</small></span>
      </li>`).join('') : '';
  return `<section class="panel srcs">
    <button type="button" class="linkish" data-act="c-sources" aria-expanded="${open}">${icon('rss', { size: 16 })} ${esc(t('cSources'))}${bad ? ` · <b class="warn-text">${esc(t('cSrcBad', { n: bad }))}</b>` : ''}</button>
    ${open ? `<ul class="plain srclist">${rows}</ul><p class="small muted">${esc(t('cBlockedNote'))}</p><p class="small muted">${esc(t('cFbNote'))}</p>` : ''}
  </section>`;
}

// ───────────────────────── 社群情報 ─────────────────────────
function priceHtml(d) {
  if (!d.price) return '';
  const p = d.price;
  const local = `${p.currency} ${Math.round(p.amount).toLocaleString()}`;
  const parts = [p.twd ? `<b class="num">${money(p.twd)}</b> <span class="muted small">(${esc(local)})</span>` : `<b class="num">${esc(local)}</b>`];
  if (p.rt === true) parts.push(esc(t('rt')));
  else if (p.rt === false) parts.push(esc(t('ow')));
  if (d.cabin) parts.push(esc(t(`cabin_${d.cabin}`)));
  return `<div class="cm-price">${parts.join(' · ')}</div>`;
}

function routeHtml(d) {
  const { o, d: dest } = d.route || {};
  if (!o && !dest) return '';
  const parts = [o && stopLabel(o), dest && stopLabel(dest)].filter(Boolean);
  return `<div class="cm-route">${parts.map(esc).join(icon('arrow-right', { size: 16 }))}</div>`;
}

function dealCardHtml(d) {
  const saved = marks.saved.has(d.id);
  const fields = dealSearchFields(d);
  const airlines = (d.airlines || []).slice(0, 3).map(carrierLabel).join(' · ');
  const also = d.alsoIn?.length ? ` · ${esc(t('cAlso', { list: d.alsoIn.join(', ') }))}` : '';
  return `
  <article class="cm-card" id="cm-${esc(d.id)}">
    <div class="tags">${kindTags(d.kinds)}${d.alliance && d.alliance !== 'NONE' ? allianceMark(d.alliance) : ''}${d.firstSeen === C.data.scanDate ? tag(t('cNew'), 'good') : ''}</div>
    <a class="cm-title" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title)}${icon('arrow-square-out', { size: 14 })}</a>
    ${routeHtml(d)}
    ${priceHtml(d)}
    ${airlines ? `<div class="small muted">${esc(airlines)}</div>` : ''}
    ${d.summary ? `<p class="cm-sum small">${esc(d.summary)}</p>` : ''}
    <div class="small muted">${esc(sourceName(d.src))} · ${esc(ago(d.published))}${also}</div>
    <div class="cm-actions">
      ${fields ? `<button type="button" class="btn" data-act="c-item-search" data-id="${esc(d.id)}">${icon('magnifying-glass', { size: 16 })}${esc(t('cSearch'))}</button>` : ''}
      ${d.playbook ? `<button type="button" class="btn" data-act="c-play" data-v="${esc(d.playbook)}">${icon('compass', { size: 16 })}${esc(t('cPlaybook'))}</button>` : ''}
      <button type="button" class="btn quiet" data-act="c-save" data-id="${esc(d.id)}" aria-pressed="${saved}">${icon('bookmark-simple', { size: 16 })}${esc(t(saved ? 'cSaved' : 'cSave'))}</button>
      <button type="button" class="btn quiet" data-act="c-hide" data-id="${esc(d.id)}">${esc(t('cHide'))}</button>
    </div>
  </article>`;
}

const sourceName = (id) => C.data?.sources?.find((s) => s.id === id)?.name || id || '';

// ── paste a post ──
function postResultHtml() {
  const p = C.post;
  const r = p.result;
  if (!r) return '';
  if (r.error) return notice(t(`cErr_${r.error}`), true);
  const bits = [];
  if (r.kinds?.length) bits.push(kindTags(r.kinds));
  if (r.cabin) bits.push(tag(t(`cabin_${r.cabin}`), 'good'));
  for (const c of (r.airlines || []).slice(0, 3)) bits.push(tag(carrierLabel(c), '', 'airplane-tilt'));
  const routes = r.routes.map((route, i) => {
    const picks = p.picks[i] || {};
    const { fields, missing } = routeFields(route, picks, { today: host.today() });
    const wild = route.nodes.filter((n) => n.kind !== 'place' && route.legs.some((l) => l.from.idx === n.idx || l.to.idx === n.idx));
    const chain = route.nodes.map((n) => `${n.gap ? `<span class="gap" title="${esc(t('cGap'))}">+</span>` : ''}<span class="node${n.kind === 'place' ? '' : ' wild'}${picks[n.idx] ? ' picked' : ''}">${esc(picks[n.idx] ? `${picks[n.idx]} ${city(picks[n.idx])}` : nodeLabel(n))}</span>`).join(icon('arrow-right', { size: 14 }));
    const detail = [
      route.price ? `<b class="num">${route.price.twd ? money(route.price.twd) : esc(`${route.price.currency} ${Math.round(route.price.amount)}`)}</b>${route.price.twd ? ` <span class="muted">(${esc(`${route.price.currency} ${Math.round(route.price.amount)}`)})</span>` : ''}` : '',
      route.bags === true ? esc(t('cBags_yes')) : route.bags === false ? esc(t('cBags_no')) : '',
      route.cabin ? esc(t(`cabin_${route.cabin}`)) : '',
      esc(t('legsN', { n: route.legs.length })),
    ].filter(Boolean).join(' · ');
    const pickers = wild.map((n) => {
      const sugg = suggestAirports(n.kind, n.code).slice(0, 8);
      return `<div class="pickrow"><span class="small">${esc(t('cPickAirport', { p: nodeLabel(n) }))}</span>
        <div class="chips">${sugg.map((code) => chip('c-pick', `${i}:${n.idx}:${code}`, esc(`${code} ${city(code)}`), picks[n.idx] === code)).join('')}</div></div>`;
    }).join('');
    return `<div class="post-route">
      <div class="chain">${chain}</div>
      <div class="small">${detail}</div>
      ${pickers}
      ${missing.length ? `<p class="small muted">${icon('info', { size: 14 })} ${esc(t('cNeedPick'))}</p>` : `<p class="small muted">${esc(t('cDatesNote'))}</p>`}
      <div class="cm-actions">
        <button type="button" class="btn primary" data-act="c-route-search" data-r="${i}" ${missing.length || !fields.o || !fields.d ? 'disabled' : ''}>${icon('magnifying-glass', { size: 16 })}${esc(t(fields.trip === 'mc' ? 'cSearchMc' : 'cSearch'))}</button>
        <button type="button" class="btn" data-act="c-route-track" data-r="${i}" ${missing.length || !fields.o || !fields.d ? 'disabled' : ''}>${icon('target', { size: 16 })}${esc(t('cTrackThis'))}</button>
      </div></div>`;
  }).join('');
  return `<div class="post-result">
      <div class="tags">${bits.join('')}</div>
      ${r.price ? `<p class="small">${esc(t('cPostCheapest', { v: r.price.twd ? money(r.price.twd) : `${r.price.currency} ${Math.round(r.price.amount)}` }))}</p>` : ''}
      <p class="small muted">${esc(t('cPostFound', { n: r.routes.length }))}</p>
      ${routes}
      ${r.playbook ? `<button type="button" class="btn block" data-act="c-play" data-v="${esc(r.playbook)}">${icon('compass', { size: 16 })}${esc(t('cPostPlaybook'))}</button>` : ''}
    </div>`;
}

function postHtml() {
  const p = C.post;
  return `<section class="panel post">
    <button type="button" class="linkish" data-act="c-post-toggle" aria-expanded="${p.open}">${icon('clipboard-text', { size: 16 })} ${esc(t('cPostTitle'))}</button>
    ${p.open ? `
      <p class="small muted">${esc(t('cPostHelp'))}</p>
      <textarea id="post-text" data-cm="postText" rows="6" placeholder="${esc(t('cPostPh'))}">${esc(p.text)}</textarea>
      <div class="form-actions"><button type="button" class="btn primary" data-act="c-post-parse">${esc(t('cPostParse'))}</button><button type="button" class="btn quiet" data-act="c-post-clear">${esc(t('cPostClear'))}</button></div>
      ${postResultHtml()}` : ''}
  </section>`;
}

export function communityHtml() {
  const d = C.data;
  const head = `<p class="intro">${esc(t('cIntro'))}</p>${postHtml()}`;
  if (!d) return `${head}${skeleton()}`;
  if (d.missing) return `${head}${notice(t('cMissing'))}${sourcesHtml()}`;
  const kinds = kindCounts(d.deals);
  const mineCount = d.deals.filter((x) => x.relevance >= MIN_RELEVANCE && !marks.hidden.has(x.id)).length;
  const list = filterDeals(d.deals, C.df, marks);
  const rel = [['mine', `${t('cFilterMine')} (${mineCount})`], ['all', t('cFilterAll')], ['saved', `${t('cFilterSaved')} (${[...marks.saved].filter((id) => d.deals.some((x) => x.id === id)).length})`]];
  const kindOpts = [['all', t('cFilterAll')], ...DEAL_KIND_ORDER.filter((k) => kinds[k]).map((k) => [k, `${t(`kind_${k}`)} ${kinds[k]}`])];
  return `${head}${statusLine()}
    ${chipRow('c-rel', rel, C.df.rel, t('cFilterMine'))}
    ${chipRow('c-kind', kindOpts, C.df.kind, t('cKind'))}
    <div class="list cm-list">${list.length ? list.slice(0, C.limit).map(dealCardHtml).join('') : `<div class="empty">${esc(t(C.df.rel === 'saved' ? 'cNoSaved' : 'cNoDeals'))}</div>`}</div>
    ${C.df.rel === 'mine' && d.deals.length > mineCount ? `<p class="small muted elsewhere">${esc(t('cElsewhere', { n: d.deals.length - mineCount }))} <button type="button" class="linkish" data-act="c-rel" data-v="all">${esc(t('cShowAll'))}</button></p>` : ''}
    ${list.length > C.limit ? `<div class="more-wrap"><button type="button" class="btn" data-act="c-more">+ ${list.length - C.limit}</button></div>` : ''}
    ${sourcesHtml()}`;
}

// ───────────────────────── 活動 (promotions) ─────────────────────────
function brandName(b) {
  if (b.program) return programName(b.program, getLang());
  if (b.carrier) return carrierLabel(b.carrier);
  return b.id === 'CRUISE' ? t('pcat_cruise') : b.id;
}

function lockTags(p) {
  return (p.lock || []).map((c) => tag(t(`pLock_${c}`), c === 'TARGETED' ? '' : 'warn')).join('');
}

function promoCardHtml({ p, mine }) {
  const dl = deadline(p, host.today());
  const saved = marks.saved.has(p.id);
  const dlTag = dl ? tag(dl.days === 0 ? t('pToday') : `${t('pUntil', { d: fmtDay(dl.date) })} · ${t('pLeft', { n: dl.days })}`, dl.tone === 'urgent' ? 'hot' : dl.tone === 'soon' ? 'warn-soft' : '', 'clock') : '';
  const brands = p.brands.map((b) => {
    const isMine = mine.some((m) => m.id === b.id);
    return tag(brandName(b), isMine ? 'good' : '', isMine ? 'identification-card' : b.kind === 'hotel' ? 'buildings' : 'airplane-tilt');
  }).join('');
  return `
  <article class="cm-card promo" id="cm-${esc(p.id)}">
    <div class="tags">${kindTags(p.kinds, 'pkind_')}${tag(t(`pcat_${p.category}`), '')}${dlTag}${lockTags(p)}</div>
    <a class="cm-title" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}${icon('arrow-square-out', { size: 14 })}</a>
    <div class="tags brands">${brands}</div>
    ${mine.length ? `<p class="small good-text">${icon('identification-card', { size: 14 })} ${esc(t('pRelated', { list: mine.map(brandName).join(', ') }))}</p>` : ''}
    ${p.summary ? `<p class="cm-sum small">${esc(p.summary)}</p>` : ''}
    <div class="small muted">${esc(sourceName(p.src))} · ${esc(ago(p.published))}</div>
    <div class="cm-actions">
      <a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(t('cOpen'))}${icon('arrow-square-out', { size: 16 })}</a>
      <button type="button" class="btn quiet" data-act="p-save" data-id="${esc(p.id)}" aria-pressed="${saved}">${icon('bookmark-simple', { size: 16 })}${esc(t(saved ? 'cSaved' : 'cSave'))}</button>
      <button type="button" class="btn quiet" data-act="p-hide" data-id="${esc(p.id)}">${esc(t('cHide'))}</button>
    </div>
  </article>`;
}

export function promosHtml() {
  const d = C.data;
  const how = `<details class="caveats match-how"><summary>${icon('info', { size: 16 })}${esc(t('pMatchTitle'))}</summary><ol>${t('pMatchSteps').map((x) => `<li>${esc(x)}</li>`).join('')}</ol><p class="small muted">${esc(t('pMatchNote'))}</p></details>`;
  const head = `<p class="intro">${esc(t('pIntro'))}</p>${how}`;
  if (!d) return `${head}${skeleton()}`;
  if (d.missing) return `${head}${notice(t('pMissing'))}`;
  const members = host.members();
  const list = filterPromos(d.promos, C.pf, { members, today: host.today(), saved: marks.saved, hidden: marks.hidden });
  const kinds = PROMO_KIND_ORDER.filter((k) => d.promos.some((x) => x.kinds.includes(k)));
  const cats = PROMO_CATEGORIES.filter((c) => d.promos.some((x) => x.category === c));
  const walletN = d.promos.filter((x) => relatedToWallet(x, members).length).length;
  const savedN = d.promos.filter((x) => marks.saved.has(x.id)).length;
  const rel = [['mine', t('cFilterMine')], ...(members.length ? [['wallet', `${t('pFilterWallet')} (${walletN})`]] : []), ['all', t('cFilterAll')], ['saved', `${t('cFilterSaved')} (${savedN})`]];
  return `${head}${statusLine()}
    ${chipRow('p-rel', rel, C.pf.rel, t('cFilterMine'))}
    ${chipRow('p-kind', [['all', t('cFilterAll')], ...kinds.map((k) => [k, t(`pkind_${k}`)])], C.pf.kind, t('cKind'))}
    ${cats.length > 1 ? chipRow('p-cat', [['all', t('cFilterAll')], ...cats.map((c) => [c, t(`pcat_${c}`)])], C.pf.cat, t('pCategory')) : ''}
    <div class="list cm-list">${list.length ? list.slice(0, C.plimit).map(promoCardHtml).join('') : `<div class="empty">${esc(t('pNone'))}</div>`}</div>
    ${list.length > C.plimit ? `<div class="more-wrap"><button type="button" class="btn" data-act="p-more">+ ${list.length - C.plimit}</button></div>` : ''}
    ${sourcesHtml()}`;
}

// ───────────────────────── actions ─────────────────────────
const mark = (set, id) => {
  if (set.has(id)) set.delete(id);
  else set.add(id);
  persistMarks();
  host.refresh();
};

const itemById = (id) => C.data?.deals?.find((x) => x.id === id);

onClick({
  'c-rel': (el) => {
    C.df.rel = el.dataset.v;
    C.limit = PAGE;
    host.refresh();
  },
  'c-kind': (el) => {
    C.df.kind = el.dataset.v;
    C.limit = PAGE;
    host.refresh();
  },
  'c-more': () => {
    C.limit += PAGE;
    host.refresh();
  },
  'p-rel': (el) => {
    C.pf.rel = el.dataset.v;
    C.plimit = PAGE;
    host.refresh();
  },
  'p-kind': (el) => {
    C.pf.kind = el.dataset.v;
    C.plimit = PAGE;
    host.refresh();
  },
  'p-cat': (el) => {
    C.pf.cat = el.dataset.v;
    C.plimit = PAGE;
    host.refresh();
  },
  'p-more': () => {
    C.plimit += PAGE;
    host.refresh();
  },
  'mp-all': () => {
    C.pf.rel = 'wallet';
    host.go('#deals/promos');
  },
  'c-save': (el) => mark(marks.saved, el.dataset.id),
  'p-save': (el) => mark(marks.saved, el.dataset.id),
  'c-hide': (el) => mark(marks.hidden, el.dataset.id),
  'p-hide': (el) => mark(marks.hidden, el.dataset.id),
  'c-sources': () => {
    C.sourcesOpen = !C.sourcesOpen;
    host.refresh();
  },
  'c-play': (el) => host.go(`#special/play/${el.dataset.v}`),
  'c-item-search': (el) => {
    const d = itemById(el.dataset.id);
    const fields = d && dealSearchFields(d);
    if (fields) host.openSearch({ fields });
  },
  'c-post-toggle': () => {
    C.post.open = !C.post.open;
    host.refresh();
    if (C.post.open) requestAnimationFrame(() => document.getElementById('post-text')?.focus());
  },
  'c-post-parse': () => {
    const text = document.getElementById('post-text')?.value ?? C.post.text;
    C.post.text = text;
    C.post.picks = {};
    C.post.result = parsePost(text, { fx: host.fx() });
    host.refresh();
    requestAnimationFrame(() => document.querySelector('.post-result, .post .notice')?.scrollIntoView({ block: 'nearest' }));
  },
  'c-post-clear': () => {
    C.post = { open: true, text: '', result: null, picks: {} };
    host.refresh();
  },
  'c-pick': (el) => {
    const [r, node, code] = el.dataset.v.split(':');
    const picks = (C.post.picks[r] ||= {});
    if (picks[node] === code) delete picks[node];
    else picks[node] = code;
    host.refresh();
  },
  'c-route-search': (el) => openRoute(Number(el.dataset.r), false),
  'c-route-track': (el) => openRoute(Number(el.dataset.r), true),
});

function openRoute(i, track) {
  const r = C.post.result;
  const route = r?.routes?.[i];
  if (!route) return;
  const { fields, missing } = routeFields(route, C.post.picks[i] || {}, { today: host.today() });
  if (missing.length) return host.toast(t('cNeedPick'));
  const cabin = route.cabin || r.cabin;
  host.openSearch({ fields: { ...fields, ...(cabin && cabin !== 'economy' ? { cabin } : {}) }, track });
  host.toast(t('cDatesNote'), 6000);
}

onField((el, kind) => {
  if (el.dataset.cm !== 'postText') return false;
  if (kind === 'input') C.post.text = el.value;
  return true;
});
