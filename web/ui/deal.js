// Fare cards: the daily-scan deals (Deals tab, ex-station view) and live search results share one card and one detail view.
// A deal is a round trip, a one-way or a multi-city trip of up to five legs; the card copes with legs that are not known yet.
import { t, getLang, countryName } from '../i18n.js';
import { icon } from '../icons.js';
import { ALLIANCES } from '../core/airlines.js';
import { searchLinks, searchLinksFor, airlineUrl, googleFlightsUrl } from '../core/links.js';
import { programName, earningMemberships } from '../core/programs.js';
import { esc, tag } from './kit.js';
import { money, localMoney, fmtDay, fmtDur, hhmm, dayDiff, city, carrierLabel, moneyPerKm } from './fmt.js';

const host = { members: () => [], isDemo: () => false, capName: (n) => String(n || '') };
/** @param {{ members?: () => object[], isDemo?: () => boolean, capName?: (n: string) => string }} h */
export const bindDeal = (h) => Object.assign(host, h);

const TIER_ICON = { hot: 'fire', great: 'thumbs-up', good: 'check' };
const ext = () => icon('arrow-square-out', { size: 16 });

export function logo(code) {
  // Carrier code shows through if the logo image fails to load.
  return `<span class="logo-wrap"><span class="logo-code">${esc(code)}</span><img class="logo" src="https://www.gstatic.com/flights/airline_logos/70px/${esc(code)}.png" alt="" loading="lazy"></span>`;
}

export const allianceName = (a) => (a === 'NONE' ? t('noAlliance') : ALLIANCES[a]?.name || a);
export const allianceMark = (a) => `<span class="al al-${esc(a)}">${esc(allianceName(a))}</span>`;

/** 'rt' | 'ow' | 'mc' — deals published before multi-city existed have no `trip`. */
export const tripOf = (d) => d.trip || (d.returnDate ? 'rt' : 'ow');
const legCountOf = (d) => d.legCount || (tripOf(d) === 'rt' ? 2 : 1);
const legDate = (d, leg, i) => leg?.segments?.[0]?.dep?.slice(0, 10) || (i === 0 ? d.departDate : tripOf(d) === 'rt' ? d.returnDate : d.departDate);

export function stopsText(d) {
  const leg = d.legs?.[0];
  const dur = fmtDur(leg?.durationMin);
  if (d.stops === 0) return `${t('nonstop')}${dur ? ' · ' + dur : ''}`;
  const via = (d.via || []).join(', ');
  return `${t('stops', { n: d.stops })}${via ? ' · ' + t('via', { v: via }) : ''}`;
}

export function tripText(d) {
  if (tripOf(d) === 'mc') {
    const last = legDate(d, d.legs?.[d.legs.length - 1], d.legs ? d.legs.length - 1 : 0);
    return `${fmtDay(d.departDate)}${last && last !== d.departDate ? ` – ${fmtDay(last)}` : ''} · ${t('legsN', { n: legCountOf(d) })}`;
  }
  if (!d.returnDate) return `${fmtDay(d.departDate)} · ${t('ow')}`;
  return `${fmtDay(d.departDate)} – ${fmtDay(d.returnDate)} · ${t('days', { n: dayDiff(d.departDate, d.returnDate) })}`;
}

export function dealTags(d, extra = []) {
  const b = [...extra];
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

export function scorePill(d) {
  const ic = TIER_ICON[d._tier];
  return `<span class="score t-${d._tier}" title="${esc(t('score'))} ${d._score}">${ic ? icon(ic, { size: 14 }) : ''}${esc(t('tier_' + d._tier))} ${d._score}</span>`;
}

/** "TPE → FCO → TPE": every airport a multi-city trip visits; a round trip or one way shows just where it goes. */
function routeHtml(d) {
  const stops = (tripOf(d) === 'mc' && d.itinerary ? String(d.itinerary).split('→') : [d.origin, d.destination]).filter(Boolean);
  return stops.map((x) => esc(String(x).split(',').join('/'))).join(icon('arrow-right', { size: 16 }));
}

/**
 * @param {object} d a deal decorated by rankDeals (_score, _tier, …)
 * @param {{ act?: string, tags?: string[] }} [o] act = the data-act that expands the card
 */
export function dealCard(d, { act = 'toggle', tags = [] } = {}) {
  const disc = d._discount;
  const delta = disc == null ? '' : disc > 0
    ? `<div class="delta">${esc(t('vsTypical', { p: disc }))}</div>`
    : `<div class="delta up">${esc(t('aboveTypical', { p: Math.abs(disc) }))}</div>`;
  const long = tripOf(d) === 'mc' && (d.legCount || 0) > 2;
  const cities = d.itinerary && tripOf(d) === 'mc'
    ? String(d.itinerary).split('→').filter((c, i, a) => a.indexOf(c) === i).map((c) => city(c.split(',')[0])).join(' · ')
    : `${city(d.origin)} – ${city(d.destination)}`;
  return `
  <article class="deal${d._tier === 'hot' || d._errorFare ? ' is-hot' : ''}" id="deal-${esc(d.id)}">
    <button class="deal-main" data-act="${esc(act)}" data-id="${esc(d.id)}" aria-expanded="false">
      <div class="deal-head">
        <span class="carrier">${logo(d.primaryCarrier)}<b>${esc(carrierLabel(d.primaryCarrier))}</b></span>
        ${allianceMark(d.alliance)}
        ${scorePill(d)}
      </div>
      <div class="deal-body">
        <div class="route${long ? ' long' : ''}">${routeHtml(d)}</div>
        <div class="price">${money(d.priceTWD)}</div>
        <div class="cities">${esc(cities)}</div>
        ${delta}
      </div>
      <div class="meta">${esc(tripText(d))} · ${esc(stopsText(d))}</div>
      ${dealTags(d, tags)}
    </button>
    <div class="deal-detail" hidden></div>
  </article>`;
}

export function legHtml(leg, title, date) {
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
      const longStop = l.durationMin > 480 || l.overnight;
      parts.push(`<li class="lay${longStop ? ' warn' : ''}">${icon(l.overnight ? 'moon' : 'clock', { size: 14 })}${esc(t('layover', { a: `${l.airport} ${city(l.airport)}`, d: fmtDur(l.durationMin) }))}</li>`);
    }
  });
  return `<div class="sec"><h4>${esc(title)} · ${fmtDay(date)}</h4><ol class="timeline">${parts.join('')}</ol></div>`;
}

/** Title of leg `i`: out / back for a round trip, "Flight 2 · FCO→TPE" for a multi-city trip. */
function legTitle(d, leg, i) {
  const trip = tripOf(d);
  if (trip === 'mc') {
    const segs = leg.segments || [];
    return `${t('legN', { n: i + 1 })} · ${segs[0]?.from || '?'}→${segs[segs.length - 1]?.to || '?'}`;
  }
  return i === 0 ? t('outbound') : t('inbound');
}

function posMarketUrl(d, m) {
  return googleFlightsUrl({ origin: d.origin, destination: d.destination, departDate: d.departDate, returnDate: d.returnDate, currency: m.currency, lang: getLang(), gl: m.country });
}

export function posRows(d) {
  const home = { country: 'TW', currency: d.currency || 'TWD', price: d.price ?? d.priceTWD, priceTWD: d.priceTWD, savingsTWD: 0, savingsPct: 0, home: true };
  const rows = [home, ...(d.pos?.markets || [])].sort((a, b) => a.priceTWD - b.priceTWD);
  return `<div class="pos-list">${rows.map((m) => {
    const val = m.home ? '' : m.savingsPct >= 1
      ? `<small class="save">${esc(t('posSave', { v: money(m.savingsTWD) }))}</small>`
      : m.savingsPct <= -1 ? `<small class="more">${esc(t('posMore', { p: Math.round(-m.savingsPct) }))}</small>` : `<small class="more">${esc(t('posSame'))}</small>`;
    const sub = `${localMoney(m.price, m.currency)}${m.match === 'carrier' ? ` · ${t('posViaCarrier')}` : ''}`;
    return `<a class="pos-row" href="${esc(m.url || posMarketUrl(d, m))}" target="_blank" rel="noopener">
      <span class="cc">${esc(m.country)}</span>
      <span class="who">${esc(m.home ? t('posHome') : t('posMarket', { c: countryName(m.country) }))}<small>${esc(sub)}</small></span>
      <span class="val">${money(m.priceTWD)}${val}</span>
    </a>`;
  }).join('')}</div>`;
}

export function caveats(open = false) {
  return `<details class="caveats"${open ? ' open' : ''}><summary>${icon('info', { size: 16 })}${esc(t('posCaveatsTitle'))}</summary><ul>${t('posCaveats').map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
}

function earnSection(d) {
  const earn = earningMemberships(host.members(), d.primaryCarrier, d.alliance);
  if (!earn.length) return '';
  return `<div class="sec"><h4>${esc(t('earnTitle'))}</h4><div class="tags">${earn.slice(0, 4).map(({ m, why }) =>
    tag(`${programName(m.program, getLang(), m.programName)}${m.owner ? ` · ${host.capName(m.owner)}` : ''} (${t(why === 'same' ? 'earnSame' : 'earnAlliance')})`, why === 'same' ? 'good' : '', 'identification-card')).join('')}</div></div>`;
}

/**
 * @param {object} d decorated deal
 * @param {{ search?: object, actions?: string, posHtml?: string }} [o]
 *   search  — the normalized search a live result came from (links then carry every filter, multi-city included)
 *   actions — extra buttons (track this, compare countries, complete the trip) placed above the links
 *   posHtml — a ready-made "other countries" section (live comparison) instead of the scan's own
 */
export function dealDetail(d, { search = null, actions = '', posHtml = '' } = {}) {
  const secs = (d.legs || []).map((leg, i) => legHtml(leg, legTitle(d, leg, i), legDate(d, leg, i)));
  const missing = legCountOf(d) - (d.legs || []).length;
  if (missing > 0) secs.push(`<p class="small muted">${esc(tripOf(d) === 'mc' ? t('legsPending', { n: missing }) : t('inboundUnknown'))}</p>`);
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

  if (posHtml) secs.push(posHtml);
  else if (d.pos?.markets?.length) {
    secs.push(`<div class="sec"><h4>${esc(t('posSection'))}${host.isDemo() ? ` · ${esc(t('posDemo'))}` : ''}</h4>${posRows(d)}${caveats()}</div>`);
  }
  secs.push(earnSection(d));

  const links = search
    ? searchLinksFor(search, { lang: getLang(), currency: 'TWD' })
    : searchLinks({ origin: d.origin, destination: d.destination, departDate: d.departDate, returnDate: d.returnDate, currency: 'TWD', lang: getLang() });
  const site = airlineUrl(d.primaryCarrier);
  const [google, ...others] = links;
  secs.push(`<div class="actions">
      <a class="btn primary block" href="${esc(google.url)}" target="_blank" rel="noopener">${esc(t('openGoogle'))}${ext()}</a>
      <div class="row">
        ${others.filter((l) => l.key !== 'airline').map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}
        ${site ? `<a class="btn" href="${esc(site)}" target="_blank" rel="noopener">${esc(t('airlineSite'))}</a>` : ''}
      </div>
      ${actions || `<button class="btn quiet" data-act="deal-search" data-id="${esc(d.id)}">${icon('magnifying-glass', { size: 16 })}${esc(t('searchThisRoute'))}</button>
      <button class="btn quiet" data-act="target" data-route="${esc(d.routeKey)}">${icon('target', { size: 16 })}${esc(t('setAlert'))}</button>`}
    </div>`);
  return secs.join('');
}

/** Expand / collapse a card, building its detail the first time. `build` returns the detail HTML. */
export function toggleCard(card, build, open) {
  const btn = card.querySelector('.deal-main');
  const det = card.querySelector('.deal-detail');
  const show = open ?? det.hidden;
  if (show && !det.innerHTML) det.innerHTML = build();
  det.hidden = !show;
  btn.setAttribute('aria-expanded', String(show));
}
