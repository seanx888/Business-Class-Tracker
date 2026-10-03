// Special fares → 玩法庫: how each "special" way of buying a ticket works — logic, buying steps, risks, a worked example
// and a cost calculator that says whether the whole trick really beats the direct fare.
// Content: web/core/playbooks.js (three languages). Community cards link here with #special/play/<id>.
import { t, getLang } from '../i18n.js';
import { icon } from '../icons.js';
import { PLAYBOOKS, playbook, pick, playCost, exampleLegs, COST_FIELDS } from '../core/playbooks.js';
import { esc, tag, notice } from './kit.js';
import { money, city } from './fmt.js';
import { onClick, onField } from './registry.js';

const host = {
  today: () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
  fx: () => null,
  go: () => {},
  toast: () => {},
  refresh: () => {},
  openSearch: () => {},
};
/** @param {Partial<typeof host>} h */
export const bindPlaybooks = (h) => Object.assign(host, h);

const P = { open: new Set(), calc: new Map(), scrollTo: null };

const CURRENCIES = ['USD', 'TWD', 'EUR', 'PHP', 'JPY', 'KRW', 'THB', 'SGD', 'GBP', 'AUD', 'VND', 'MYR', 'IDR', 'INR'];
const RISK_TONE = { low: 'good', medium: 'warn-soft', high: 'warn' };
// Where a playbook's own "go do it" button leads.
const GO = {
  'interline-multicity': { kind: 'search', label: 'pbGoMc' },
  'multi-city': { kind: 'search', label: 'pbGoMc' },
  stopover: { kind: 'search', label: 'pbGoMc' },
  'ex-station': { kind: 'hash', to: '#special', label: 'pbGoEx' },
  'foreign-pos': { kind: 'hash', to: '#special/pos', label: 'pbGoPos' },
  'error-fare': { kind: 'hash', to: '#deals/community', label: 'pbGoCommunity' },
};

/** Open one playbook (from #special/play/<id>) and scroll to it once drawn. */
export function openPlaybook(id) {
  if (!playbook(id)) return;
  P.open.add(id);
  P.scrollTo = id;
}

/** Called after the view is drawn: bring a deep-linked playbook into view. */
export function revealPlaybook() {
  if (!P.scrollTo) return;
  const el = document.getElementById(`pb-${P.scrollTo}`);
  P.scrollTo = null;
  el?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function calcFor(p) {
  if (!P.calc.has(p.id)) {
    const ex = p.example?.items?.[0];
    P.calc.set(p.id, { amount: ex ? String(ex.price) : '', currency: ex?.currency || 'USD', baseline: '', extras: { ...(p.cost.defaults || {}) } });
  }
  return P.calc.get(p.id);
}

// ───────────────────────── cost calculator ─────────────────────────
function calcResultHtml(p) {
  const c = calcFor(p);
  const amount = Number(c.amount);
  if (!(amount > 0)) return `<p class="small muted">${esc(t('pcEnter'))}</p>`;
  const base = Number(c.baseline);
  const r = playCost({ ticket: { amount, currency: c.currency }, extras: c.extras, fx: host.fx(), baselineTWD: base > 0 ? base : null });
  if (r.total == null) return notice(t('pcNoRate'), true);
  const rows = [
    [t('pcTicket'), money(r.ticketTWD)],
    ...(r.fee ? [[t('pcFee'), money(r.fee)]] : []),
    ...(r.extra ? [[t('pcExtras'), money(r.extra)]] : []),
  ];
  const verdict = r.saving == null
    ? `<p class="small muted">${esc(t('pcNoBaseline'))}</p>`
    : r.saving >= 0
      ? `<p class="verdict good">${icon('trend-down', { size: 16 })} ${esc(t('pcSave', { v: money(r.saving), p: r.savingPct }))}</p>`
      : `<p class="verdict bad">${icon('trend-up', { size: 16 })} ${esc(t('pcMore', { v: money(-r.saving), p: Math.abs(r.savingPct) }))}</p>`;
  return `<div class="calc-sum">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b class="num">${v}</b></div>`).join('')}<div class="total"><span>${esc(t('pcTotal'))}</span><b class="num">${money(r.total)}</b></div></div>${verdict}`;
}

function calcHtml(p) {
  const c = calcFor(p);
  const rates = host.fx()?.rates ? Object.keys(host.fx().rates) : [];
  const currencies = [...new Set([...CURRENCIES.filter((x) => x === 'TWD' || rates.includes(x) || !rates.length), c.currency])];
  const fields = p.cost.fields.filter((f) => f !== 'ticket' && COST_FIELDS.includes(f));
  return `<div class="sec calc">
    <h4>${icon('calculator', { size: 16 })} ${esc(t('pbCalc'))}</h4>
    <div class="grid2">
      <div class="field"><label for="pc-${p.id}-amount">${esc(t('pcTicket'))}</label><input id="pc-${p.id}-amount" type="number" inputmode="decimal" min="0" step="any" data-pc="${p.id}:amount" value="${esc(c.amount)}"></div>
      <div class="field"><label for="pc-${p.id}-cur">${esc(t('pcCurrency'))}</label><select id="pc-${p.id}-cur" data-pc="${p.id}:currency">${currencies.map((x) => `<option value="${x}" ${x === c.currency ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="grid2 form-row">${fields.map((f) => `<div class="field"><label for="pc-${p.id}-${f}">${esc(t(`pcField_${f}`))}</label><input id="pc-${p.id}-${f}" type="number" inputmode="numeric" min="0" step="100" data-pc="${p.id}:x:${f}" value="${esc(c.extras[f] ?? '')}"></div>`).join('')}</div>
    <div class="field form-row"><label for="pc-${p.id}-base">${esc(t('pcBaseline'))}</label><input id="pc-${p.id}-base" type="number" inputmode="numeric" min="0" step="1000" data-pc="${p.id}:baseline" value="${esc(c.baseline)}"><small class="hint">${esc(t('pcBaselineHelp'))}</small></div>
    <div class="calc-out" data-pc-out="${p.id}" aria-live="polite">${calcResultHtml(p)}</div>
    <p class="small muted">${esc(t('pcFeeNote'))}</p>
  </div>`;
}

// ───────────────────────── example (the Etihad screenshots) ─────────────────────────
function exampleHtml(p) {
  const ex = p.example;
  if (!ex) return '';
  return `<div class="sec">
    <h4>${esc(t('pbExample'))}</h4>
    <p class="small muted">${esc(pick(ex.note, getLang()))} ${esc(t('pbExNote'))}</p>
    <div class="ex-items">${ex.items.map((it, i) => `
      <div class="ex-item">
        <div class="chain">${chainHtml(it.legs)}</div>
        <div class="small"><b class="num">${esc(`${it.currency} ${it.price}`)}</b> · ${esc(t(it.bags ? 'cBags_yes' : 'cBags_no'))} · ${esc(t(`cabin_${it.cabin}`))}</div>
        <div class="cm-actions">
          <button type="button" class="btn" data-act="pb-example" data-id="${esc(p.id)}" data-v="${esc(it.id)}">${icon('magnifying-glass', { size: 16 })}${esc(t('pbApplySearch'))}</button>
          <button type="button" class="btn quiet" data-act="pb-calc-from" data-id="${esc(p.id)}" data-v="${esc(it.id)}">${icon('calculator', { size: 16 })}${esc(t('pbApplyCalc', { n: i + 1 }))}</button>
        </div>
      </div>`).join('')}</div>
  </div>`;
}

function chainHtml(legs) {
  const node = (c) => `<span class="node">${esc(c)} ${esc(city(c))}</span>`;
  let html = node(legs[0].o);
  legs.forEach((l, i) => {
    // a leg that starts somewhere other than where the last one ended is a gap you cover yourself (an open-jaw)
    if (i && legs[i - 1].d !== l.o) html += `<span class="gap" title="${esc(t('cGap'))}">+</span>${node(l.o)}`;
    html += `${icon('arrow-right', { size: 14 })}${node(l.d)}`;
  });
  return html;
}

// ───────────────────────── the page ─────────────────────────
function cardHtml(p) {
  const open = P.open.has(p.id);
  const lang = getLang();
  const go = GO[p.id];
  const list = (items, cls = '') => `<ul class="plain ${cls}">${items.map((x) => `<li>${esc(pick(x, lang))}</li>`).join('')}</ul>`;
  const body = open ? `
    <div class="pb-body">
      <div class="sec"><h4>${esc(t('pbLogic'))}</h4>${list(p.logic)}</div>
      <div class="sec"><h4>${esc(t('pbSteps'))}</h4><ol class="steps">${p.steps.map((x) => `<li>${esc(pick(x, lang))}</li>`).join('')}</ol></div>
      <div class="sec risks"><h4>${icon('warning', { size: 16 })} ${esc(t('pbRisks'))}</h4>${list(p.risks, 'risk-list')}</div>
      ${exampleHtml(p)}
      ${calcHtml(p)}
      ${p.tools?.length ? `<div class="sec"><h4>${esc(t('pbTools'))}</h4><div class="links">${p.tools.map((x) => `<a class="btn" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(pick(x.label, lang))}${icon('arrow-square-out', { size: 16 })}</a>`).join('')}</div></div>` : ''}
      ${go ? `<div class="actions"><button type="button" class="btn primary block" data-act="pb-go" data-id="${esc(p.id)}">${esc(t(go.label))}</button></div>` : ''}
    </div>` : '';
  return `<article class="pb${open ? ' open' : ''}${p.featured ? ' featured' : ''}" id="pb-${esc(p.id)}">
    <button type="button" class="pb-head" data-act="pb-toggle" data-id="${esc(p.id)}" aria-expanded="${open}">
      <span class="pb-icon">${icon(p.icon || 'compass', { size: 22 })}</span>
      <span class="pb-title"><b>${esc(pick(p.title, lang))}</b><small>${esc(pick(p.tagline, lang))}</small>
        <span class="tags">${tag(t(`pbRisk_${p.risk}`), RISK_TONE[p.risk])}${tag(`${'●'.repeat(p.effort)}${'○'.repeat(3 - p.effort)} ${t(`pbEffort_${p.effort}`)}`)}${p.featured ? tag(t('pbFeatured'), 'pos', 'star') : ''}</span></span>
      <span class="pb-caret">${icon(open ? 'caret-up' : 'caret-down', { size: 20 })}</span>
    </button>${body}
  </article>`;
}

export function playbooksHtml() {
  return `<p class="intro">${esc(t('pbIntro'))}</p>
    ${notice(t('pbDisclaimer'), true)}
    <div class="list pb-list">${PLAYBOOKS.map(cardHtml).join('')}</div>`;
}

// ───────────────────────── actions ─────────────────────────
onClick({
  'pb-toggle': (el) => {
    const id = el.dataset.id;
    if (P.open.has(id)) P.open.delete(id);
    else P.open.add(id);
    host.refresh();
  },
  'pb-go': (el) => {
    const go = GO[el.dataset.id];
    if (!go) return;
    if (go.kind === 'hash') host.go(go.to);
    else host.openSearch({ fields: { trip: 'mc' } });
  },
  'pb-example': (el) => {
    const it = playbook(el.dataset.id)?.example?.items.find((x) => x.id === el.dataset.v);
    if (!it) return;
    const legs = exampleLegs(it, host.today());
    host.openSearch({ fields: { trip: 'mc', o: legs[0].o, d: legs[0].d, depart: legs[0].date, segs: legs, cabin: it.cabin } });
    host.toast(t('pbExApplied'), 6000);
  },
  'pb-calc-from': (el) => {
    const p = playbook(el.dataset.id);
    const it = p?.example?.items.find((x) => x.id === el.dataset.v);
    if (!it) return;
    const c = calcFor(p);
    c.amount = String(it.price);
    c.currency = it.currency;
    host.refresh();
  },
});

// Typing in the calculator updates the result in place, so the keyboard stays open.
onField((el, kind) => {
  const key = el.dataset.pc;
  if (!key) return false;
  const [id, field, extra] = key.split(':');
  const p = playbook(id);
  if (!p) return true;
  const c = calcFor(p);
  if (field === 'x') c.extras[extra] = el.value;
  else c[field] = el.value;
  const out = document.querySelector(`[data-pc-out="${id}"]`);
  if (out) out.innerHTML = calcResultHtml(p);
  return kind === 'input' || kind === 'change';
});
