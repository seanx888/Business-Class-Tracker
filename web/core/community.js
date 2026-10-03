// Reads a deal post — an RSS item from Fly4free / Travel-Dealz / Reddit / PTT …, or text pasted from Facebook / LINE / Dcard —
// and works out what it is: route, price, cabin, airlines, and WHICH TRICK it is (error fare, ex-station, multi-city,
// interline, stopover, hidden-city …). Shared by the daily scan (scripts/community.mjs) and the app's "paste a post".
//
// Policy, same as everywhere: anything that touches mainland China / Hong Kong / Macau — a carrier, a city, an airport code —
// is dropped, never shown.
import { AIRLINES, BLOCKED_CARRIERS, allianceOf, LCC_CARRIERS } from './airlines.js';
import { AIRPORTS } from './airports.js';
import { findPlaces, mentionsChinaPlace, makeMatcher, countryOf } from './places.js';

export const DEAL_KINDS = ['error-fare', 'ex-station', 'multi-city', 'interline', 'stopover', 'hidden-city', 'sale'];

/** Which playbook (web/core/playbooks.js) explains each kind, most specific first. */
export const KIND_PLAYBOOK = [
  ['interline', 'interline-multicity'],
  ['error-fare', 'error-fare'],
  ['hidden-city', 'hidden-city'],
  ['multi-city', 'multi-city'],
  ['stopover', 'stopover'],
  ['ex-station', 'ex-station'],
];

const HOME_AIRPORTS = new Set(['TPE', 'TSA', 'KHH', 'RMQ', 'TNN']);
const APAC_REGIONS = new Set(['TW', 'JP', 'KR', 'SEA', 'SAS', 'CAS', 'OC']);
const APAC_COUNTRIES = new Set(['TW', 'JP', 'KR', 'TH', 'VN', 'PH', 'SG', 'MY', 'ID', 'KH', 'LA', 'MM', 'BN', 'IN', 'LK', 'NP', 'BD', 'MV', 'MN', 'AU', 'NZ', 'GU', 'PW', 'FJ', 'MP']);
// Cities a Taipei flyer can reach cheaply — a deal starting there is an "ex-station" opportunity.
export const EX_STATIONS = new Set(['ICN', 'GMP', 'PUS', 'BKK', 'DMK', 'SGN', 'HAN', 'DAD', 'MNL', 'CRK', 'CEB', 'KUL', 'SIN', 'NRT', 'HND', 'KIX', 'NGO', 'FUK', 'CTS', 'OKA', 'CGK', 'DPS', 'HKT', 'PNH', 'SAI', 'DEL', 'BOM']);

// ───────────────────────── airlines ─────────────────────────
const NICKNAMES = {
  DL: ['delta', '達美'], UA: ['united', '聯合航空'], AA: ['american airlines', '美國航空'], TK: ['turkish', '土耳其航空', '土航'], QR: ['qatar', '卡達航空'],
  EY: ['etihad', '阿提哈德'], EK: ['emirates', '阿聯酋航空'], BR: ['eva air', 'eva', '長榮'], CI: ['china airlines', '華航'], JX: ['starlux', '星宇'],
  IT: ['tigerair taiwan', '虎航', '台灣虎航'], SQ: ['singapore airlines', '新航', '新加坡航空'], NH: ['ana', 'all nippon', '全日空'], JL: ['jal', 'japan airlines', '日航'],
  KE: ['korean air', '大韓航空', '大韓'], OZ: ['asiana', '韓亞航空', '韓亞'], TG: ['thai airways', '泰航', '泰國航空'], VN: ['vietnam airlines', '越航', '越南航空'],
  PR: ['philippine airlines', '菲航', '菲律賓航空'], MH: ['malaysia airlines', '馬航'], AF: ['air france', '法航'], KL: ['klm', '荷航'], LH: ['lufthansa', '漢莎'],
  BA: ['british airways', '英航'], QF: ['qantas', '澳航'], '5J': ['cebu pacific', '宿霧太平洋'], AK: ['airasia', '亞洲航空', '亞航'], MM: ['peach', '樂桃'],
  TR: ['scoot', '酷航'], JQ: ['jetstar', '捷星'], VJ: ['vietjet', '越捷'],
};
const AIRLINE_ENTRIES = [];
for (const [code, a] of Object.entries(AIRLINES)) AIRLINE_ENTRIES.push([a.en.replace(/\s*\(.*\)$/, ''), code], [a.zh, code]);
for (const [code, names] of Object.entries(NICKNAMES)) for (const n of names) AIRLINE_ENTRIES.push([n, code]);
const airlineMatcher = makeMatcher(AIRLINE_ENTRIES);

// Names of the carriers the app never shows, in the languages posts are written in.
const BLOCKED_ENTRIES = [
  ...Object.values(BLOCKED_CARRIERS).map((n) => [n, n]),
  ...['cathay', 'dragonair', 'air china', 'china eastern', 'china southern', 'hainan airlines', 'hainan', 'shenzhen airlines', 'sichuan airlines', 'xiamenair', 'xiamen air',
    'shandong airlines', 'juneyao', 'spring airlines', 'hong kong airlines', 'hk express', 'greater bay airlines', 'air macau', 'tibet airlines', 'loong air',
    '國泰', '港龍', '港航', '香港航空', '香港快運', '國航', '東航', '南航', '海航', '深航', '川航', '廈航', '春秋航空', '吉祥航空', '山航', '澳門航空', '大灣區航空',
    '캐세이', '대한항공 아님'].map((n) => [n, n]),
];
const blockedMatcher = makeMatcher(BLOCKED_ENTRIES.filter(([n]) => n !== '대한항공 아님'));
const FLIGHT_NO = new RegExp(`(?:^|[^A-Za-z0-9])(${Object.keys(BLOCKED_CARRIERS).filter((c) => !['CK', 'O3'].includes(c)).join('|')})\\s?\\d{2,4}(?![0-9])`);

/** Does the text mention a mainland China / Hong Kong / Macau carrier, place or flight number? */
export function mentionsChina(text) {
  const s = String(text ?? '');
  return mentionsChinaPlace(s) || blockedMatcher(s).length > 0 || FLIGHT_NO.test(s);
}

/** Airline codes mentioned, in order of appearance, without repeats. */
export function airlinesIn(text) {
  const out = [];
  for (const h of airlineMatcher(text)) if (!out.includes(h.value)) out.push(h.value);
  return out;
}

// ───────────────────────── cabin ─────────────────────────
const CABIN_RULES = [
  ['first', /\bfirst[- ]class\b|\bfirst\b(?= class| suite)|頭等|头等|퍼스트/i],
  ['business', /\bbusiness(?:[- ]class)?\b|\bpolaris\b|\bclub world\b|\bupper class\b|\bsuites?\b|商務|商务|비즈니스/i],
  ['premium', /premium[- ]economy|premium eco|豪華經濟|豪华经济|프리미엄\s?이코노미/i],
  ['economy', /\beconomy\b|basic economy|經濟艙|经济舱|이코노미|\bcoach\b/i],
];
export function detectCabin(text, categories = []) {
  const s = `${text} ${categories.join(' ')}`;
  for (const [cabin, re] of CABIN_RULES) if (re.test(s)) return cabin;
  return null;
}

// ───────────────────────── price ─────────────────────────
const SYMBOL = { '€': 'EUR', '£': 'GBP', '₩': 'KRW', '₱': 'PHP', '฿': 'THB', '₹': 'INR', 'US$': 'USD', 'U$': 'USD', 'NT$': 'TWD', NT: 'TWD', 'S$': 'SGD', 'A$': 'AUD', 'C$': 'CAD', RM: 'MYR', 'HK$': 'HKD' };
const WORD_CUR = {
  美金: 'USD', 美元: 'USD', 美: 'USD', 台幣: 'TWD', 新台幣: 'TWD', 元: 'TWD', 塊: 'TWD', 圓: 'TWD', 歐元: 'EUR', 英鎊: 'GBP', 日圓: 'JPY', 日幣: 'JPY', 円: 'JPY',
  韓元: 'KRW', 원: 'KRW', 泰銖: 'THB', 比索: 'PHP', 新幣: 'SGD', 馬幣: 'MYR',
};
const CODES = 'USD|EUR|GBP|TWD|NTD|JPY|KRW|THB|PHP|MYR|SGD|AUD|CAD|VND|IDR|INR|AED|CHF';
const SYMBOLS = 'US\\$|U\\$|NT\\$|S\\$|A\\$|C\\$|HK\\$|RM|€|£|₩|₱|฿|₹|\\$|¥';
const PRICE_BEFORE = new RegExp(`(${SYMBOLS}|\\b(?:${CODES}))\\s?(\\d[\\d,]*(?:\\.\\d+)?)(?:\\s?(k|K|萬|万))?`, 'g');
const PRICE_AFTER = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s?(萬|万)?\\s?(美金|美元|美(?!國|西|東|洲|食|麗|術|女|景|好|式)|台幣|新台幣|元(?!旦|宵|月|年|氣|素|首|老|祖|宇|朗)|塊|圓|歐元|英鎊|日圓|日幣|円|韓元|원|泰銖|比索|新幣|馬幣|€|£|\\b(?:${CODES}))`, 'g');
const PLAUSIBLE = { USD: [30, 30000], EUR: [30, 30000], GBP: [30, 30000], SGD: [30, 40000], AUD: [30, 40000], CAD: [30, 40000], MYR: [100, 120000], TWD: [1000, 2000000], JPY: [3000, 4000000], KRW: [30000, 40000000], THB: [800, 900000], PHP: [1500, 1500000], VND: [500000, 500000000], IDR: [500000, 500000000], INR: [2000, 3000000], AED: [100, 100000], CHF: [30, 30000], HKD: [200, 200000] };

function money(amountText, cur, wan, kilo, cjk) {
  let n = Number(String(amountText).replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  if (wan) n *= 10000;
  if (kilo) n *= 1000;
  const currency = cur === 'NTD' ? 'TWD' : cur === '$' ? (cjk ? 'TWD' : 'USD') : cur === '¥' ? 'JPY' : SYMBOL[cur] || WORD_CUR[cur] || cur;
  const [lo, hi] = PLAUSIBLE[currency] || [20, 1e9];
  return n >= lo && n <= hi ? { amount: Math.round(n * 100) / 100, currency } : null;
}

/** Every price in the text, in reading order: [{ amount, currency, index }]. A bare "$" means NT$ in Chinese text and US$ elsewhere. */
export function findPrices(text) {
  const s = String(text ?? '');
  const cjk = /[㐀-鿿]/.test(s);
  const out = [];
  for (const m of s.matchAll(PRICE_BEFORE)) {
    const p = money(m[2], m[1].toUpperCase() === m[1] ? m[1] : m[1].toUpperCase(), /萬|万/.test(m[3] || ''), /k/i.test(m[3] || '') && !/萬|万/.test(m[3] || ''), cjk);
    if (p) out.push({ ...p, index: m.index });
  }
  for (const m of s.matchAll(PRICE_AFTER)) {
    const p = money(m[1], m[3], !!m[2], false, cjk);
    if (p) out.push({ ...p, index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
}

const RT_RE = /round[- ]?trip|return flights?|\breturn\b|來回|往返|왕복/i;
const OW_RE = /one[- ]?way|單程|单程|편도/i;
const tripType = (text) => (OW_RE.test(text) ? false : RT_RE.test(text) ? true : null);

export function toTWD(amount, currency, fx) {
  if (!Number.isFinite(amount)) return null;
  if (currency === 'TWD') return Math.round(amount);
  const r = fx?.rates?.[currency];
  return r ? Math.round(amount / r) : null;
}

// ───────────────────────── kinds (which trick is it?) ─────────────────────────
const KIND_RULES = [
  ['error-fare', /error fares?|mistake fares?|\bmistake\b|glitch|fat[- ]finger|bug[- ]?(fare|票|價)|(票價|fare)\s?bug|錯誤票價|錯價|價格錯誤|系統錯誤|오류\s?운임|버그\s?운임/i],
  ['hidden-city', /hidden[- ]city|skiplagg?ing|throw[- ]?away|甩尾|跳段|棄程|飛一半|히든\s?시티/i],
  ['interline', /interlin(e|ing)|聯運|联运|聯程|연계\s?운송/i],
  ['multi-city', /multi[- ]?city|open[- ]?jaw|multi[- ]?stop|多點進出|多點|多段|開口|開口票|複雜行程|다구간/i],
  ['stopover', /stopover|layover.{0,12}(days?|nights?)|free stop|停留|轉機停留|스톱오버/i],
  ['ex-station', /\bex[- ]?(station|[A-Z]{3})\b|外站|origin trick|positioning flight|定位機票|定位航班|beyond fare|第六自由|외항/i],
  ['sale', /\bsale\b|% off|discount|promo(tion)?\b|special offer|flash|limited[- ]time|特價|特价|折扣|優惠|促銷|買一送一|할인|특가|セール/i],
];
export function detectKinds(text, categories = []) {
  const s = `${text} ${categories.join(' ')}`;
  return KIND_RULES.filter(([, re]) => re.test(s)).map(([k]) => k);
}

const NON_FLIGHT = /\bhotels?\b|\bresorts?\b|\bcruises?\b|all[- ]inclusive|\/double\b|per night|b&b|\bstay\b|accommodation|rental car|car hire|飯店|酒店(?!集團)|郵輪|住宿/i;
const FLIGHT_WORD = /\bflights?\b|\bairfare|\bfares?\b|\bairlines?\b|\bairways\b|機票|航班|航空|항공/i;

// ───────────────────────── route ─────────────────────────
const CURRENCY_AHEAD = /^\s*(?:[€£$¥₩]|US\$|NT\$|USD|EUR|GBP|TWD|\d[\d,]*\s?(?:€|£|\$))/;


/** First "to" (or similar) at or after `from`, as { index } relative to the whole text. */
function afterIndex(t, from, re) {
  const m = re.exec(t.slice(from));
  return m ? { index: from + m.index } : null;
}

/** The word / symbol that separates origin from destination when the title has no "from": to · → · – · " - " · a hyphen between CJK words. */
function separator(t) {
  const m = /\bto\b|→|->|↔|⇄|–|—|\s-\s|[\u3400-\u9fff]-(?=[\u3400-\u9fff])/i.exec(t);
  if (!m) return null;
  return { index: /^[\u3400-\u9fff]-$/.test(m[0]) ? m.index + 1 : m.index };
}

/** Chinese titles: "台北到東京", "台北飛東京", "台北-東京" — two places joined by a one-character verb or a hyphen. */
function cjkPair(t, hits) {
  for (let i = 0; i + 1 < hits.length; i++) {
    const gap = t.slice(hits[i].index + hits[i].text.length, hits[i + 1].index);
    if (/^\s*(?:到|至|飛|往|-|→|~)\s*$/.test(gap)) return [hits[i], hits[i + 1]];
  }
  return null;
}

/**
 * Where does the deal go? Handles the title styles of the deal sites:
 *   "…flights from Riga to South Korea for €584" · "Kuala Lumpur: €500 … Flights from 8 European Countries" ·
 *   "Korean Air: San Francisco – Chiang Mai, Thailand. $811." · "Business Class Deal: Stockholm to Seoul 1605€"
 * @returns {{ o: object|null, d: object|null, codes: string[] }} o / d = { kind: 'place'|'country'|'region', code }
 */
export function extractRoute(title) {
  const t = String(title ?? '');
  const hits = findPlaces(t).filter((h, i, all) => {
    // "Chiang Mai, Thailand": the country that merely explains the city before it is not a second stop
    const prev = all[i - 1];
    return !(h.kind === 'country' && prev && prev.kind === 'place' && /^[\s,(]{1,3}$/.test(t.slice(prev.index + prev.text.length, h.index)));
  });
  const pick = (from, to) => hits.find((h) => h.index >= from && h.index < to) || null;
  const norm = (h) => (h ? { kind: h.kind, code: h.code } : null);
  const fromRe = /\bfrom\b/gi;
  let fromAt = -1;
  for (const m of t.matchAll(fromRe)) {
    if (CURRENCY_AHEAD.test(t.slice(m.index + 4))) continue; // "from €454" is a price, not an origin
    fromAt = m.index;
    break;
  }
  const toAfter = fromAt >= 0 ? afterIndex(t, fromAt, /\bto\b/i) : separator(t);
  let o = null;
  let d = null;
  if (fromAt >= 0 && toAfter) {
    const toIdx = toAfter.index;
    o = pick(fromAt, toIdx);
    d = pick(toIdx, t.length);
  } else if (fromAt >= 0) {
    o = pick(fromAt, t.length);
    d = pick(0, fromAt);
  } else if (hits.length >= 2 && toAfter) {
    o = hits.find((h) => h.index < toAfter.index) || null;
    d = hits.find((h) => h.index > toAfter.index) || null;
  } else if (hits.length >= 2 && cjkPair(t, hits)) {
    [o, d] = cjkPair(t, hits);
  } else if (hits.length) {
    d = hits[0];
  }
  return { o: norm(o), d: norm(d), codes: [...new Set(hits.map((h) => h.code))] };
}

// ───────────────────────── scope + relevance ─────────────────────────
const placeCountry = (r) => (!r ? null : r.kind === 'country' ? r.code : r.kind === 'place' ? countryOf(r.code) : null);
const placeRegion = (r) => (r && r.kind === 'place' ? AIRPORTS[r.code]?.region || null : r && r.kind === 'region' ? r.code : null);

/** 'home' (starts in Taiwan) · 'apac' (starts in Asia-Pacific, i.e. reachable ex-station) · 'inbound' (ends in Taiwan) · 'global' · 'unknown' */
export function scopeOf(route, text = '') {
  const { o, d } = route;
  const oc = placeCountry(o);
  if (o?.kind === 'place' && HOME_AIRPORTS.has(o.code)) return 'home';
  if (oc === 'TW') return 'home';
  if (o && (APAC_COUNTRIES.has(oc) || APAC_REGIONS.has(placeRegion(o)) || o.code === 'ASIA' || o.code === 'SEA' || o.code === 'OC')) return 'apac';
  const dc = placeCountry(d);
  if (dc === 'TW' || (d?.kind === 'place' && HOME_AIRPORTS.has(d.code))) return 'inbound';
  if (/taiwan|taipei|taoyuan|台灣|臺灣|台北|桃園|대만|타이베이/i.test(text)) return 'inbound';
  return o || d ? 'global' : 'unknown';
}

const BASE = { home: 55, apac: 40, inbound: 25, global: 12, unknown: 8 };

/** 0–99: how worth a Taiwan-based flyer's attention. Price does not matter here — the post is already a "deal". */
export function relevanceOf(item, { today } = {}) {
  let r = BASE[item.scope] ?? 8;
  r += { business: 15, first: 15, premium: 6 }[item.cabin] || 0;
  if (item.kinds.includes('error-fare')) r += 20;
  if (item.kinds.some((k) => ['ex-station', 'multi-city', 'interline', 'stopover'].includes(k))) r += 6;
  if (item.kinds.includes('sale')) r += 2;
  if (item.airlines?.some((c) => allianceOf(c) === 'SKYTEAM')) r += 3;
  if (item.airlines?.some((c) => ['CI', 'BR', 'JX'].includes(c))) r += 3;
  if (item.airlines?.every((c) => LCC_CARRIERS.has(c)) && item.airlines?.length) r -= 4;
  if (item.mentionsTaiwan) r += 10;
  if (/\b(hot|fare drop|excellent deal|amazing|incredible|don'?t miss)\b/i.test(item.title)) r += 3;
  if (today && item.published) {
    const age = (Date.parse(`${today}T12:00:00Z`) - Date.parse(item.published)) / 86400000;
    r += age <= 1.5 ? 8 : age <= 3.5 ? 4 : age >= 14 ? -8 : 0;
  }
  return Math.max(0, Math.min(99, Math.round(r)));
}

export function playbookFor(kinds) {
  for (const [kind, id] of KIND_PLAYBOOK) if (kinds.includes(kind)) return id;
  return null;
}

const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);

/**
 * Classify one feed item.
 * @param {{ id, title, url, published, summary, categories }} raw
 * @param {{ source?: object, fx?: object, today?: string, maxAgeDays?: number }} ctx
 * @returns {{ item: object } | { drop: 'china' | 'stale' | 'not-a-deal' }}
 */
export function classifyDeal(raw, ctx = {}) {
  const { source = {}, fx = null, today = null, maxAgeDays = 21 } = ctx;
  const title = String(raw.title || '');
  const text = `${title}. ${raw.summary || ''}`;
  if (mentionsChina(title) || mentionsChina((raw.summary || '').slice(0, 600)) || (raw.categories || []).some(mentionsChina)) return { drop: 'china' };
  if (today && raw.published && (Date.parse(`${today}T12:00:00Z`) - Date.parse(raw.published)) / 86400000 > maxAgeDays) return { drop: 'stale' };

  const prices = findPrices(title);
  const price = prices[0] || findPrices(text)[0] || null;
  const route = extractRoute(title);
  const airlines = airlinesIn(title).length ? airlinesIn(title) : airlinesIn((raw.summary || '').slice(0, 300));
  const flighty = FLIGHT_WORD.test(title) || airlines.length > 0 || (route.o && route.d);
  if (!flighty || (NON_FLIGHT.test(title) && !/\bflights?\b|機票/i.test(title))) return { drop: 'not-a-deal' };
  if (!price && !(route.o && route.d)) return { drop: 'not-a-deal' }; // news about an airline is not a fare

  const kinds = detectKinds(title, raw.categories);
  let scope = scopeOf(route, text);
  // Posts from a Taiwanese board are about Taiwan even when the title does not spell out the origin.
  if (source.region === 'tw' && (scope === 'unknown' || (scope === 'global' && !route.o))) scope = 'home';
  if (scope === 'apac' && route.o?.kind === 'place' && EX_STATIONS.has(route.o.code) && !kinds.includes('ex-station')) kinds.push('ex-station');
  if (!kinds.length) kinds.push('sale');
  const item = {
    id: raw.id,
    src: source.id || null,
    url: raw.url,
    title,
    published: raw.published,
    summary: clip(String(raw.summary || '').replace(/\s*\[…\]\s*$|\s*\[&#8230;\]\s*$/g, ''), 260),
    kinds,
    cabin: detectCabin(title, raw.categories) || (/full-service|full service/i.test(title) ? 'economy' : null),
    price: price ? { amount: price.amount, currency: price.currency, twd: toTWD(price.amount, price.currency, fx), rt: tripType(text) } : null,
    route,
    airlines,
    alliance: airlines.length && airlines.every((c) => allianceOf(c) === allianceOf(airlines[0])) ? allianceOf(airlines[0]) : null,
    scope,
    mentionsTaiwan: /taiwan|taipei|台灣|臺灣|台北/i.test(title),
    playbook: playbookFor(kinds),
  };
  item.relevance = relevanceOf(item, { today });
  return { item };
}

// ───────────────────────── pasted posts (Facebook / LINE / PTT / Dcard / anything copied) ─────────────────────────
// Facebook groups cannot be read by a program, so people paste the post instead. A post like
//   克拉克-台北-紐約-普吉島 / 全程只要562美（含行李 …
// becomes: a chain of stops, flights between them (a space between two cities = an overland gap), price, baggage, airline, trick.
const ROUTE_SEP = /\s*(?:-|–|—|→|➔|➜|＞|>|~|～|=>|\/|、|\+|＋)\s*/;
const BAGS_NO = /不含(?:托運)?(?:行李)|不含托运|無行李|无行李|without (?:checked )?(?:bag|luggage)|no (?:checked )?(?:bag|luggage)/i;
const BAGS_YES = /含(?:托運)?行李|含托运|(?:with|incl\w*)\s+(?:checked\s+)?(?:bag|luggage)/i;

const hitsOf = (token) => findPlaces(token).filter((h) => h.kind !== undefined);

/** A token such as "克拉克" or "米蘭 冰島" is "placey" when almost nothing but place names is in it. */
function placeyToken(token) {
  const hits = hitsOf(token);
  if (!hits.length) return null;
  let rest = token;
  for (const h of hits) rest = rest.replace(h.text, '');
  const leftover = rest.replace(/[\s,，、()（）.。:：]/g, '');
  return leftover.length <= 3 ? hits : null;
}

/** Turn "A-B-C D-E" into nodes (with `gap` marking a hop you make yourself) and the flights between them. */
export function parseRouteLine(line) {
  const tokens = String(line).split(ROUTE_SEP).map((t) => t.replace(/[（(].*$/, '').trim()).filter(Boolean);
  if (tokens.length < 2) return null;
  const groups = tokens.map(placeyToken);
  if (groups.filter(Boolean).length < 2 || groups.filter(Boolean).length / tokens.length < 0.7) return null;
  const nodes = [];
  for (const hits of groups) {
    if (!hits) continue;
    hits.forEach((h, i) => nodes.push({ idx: nodes.length, code: h.code, kind: h.kind, text: h.text, gap: i > 0 }));
  }
  const legs = [];
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].gap) continue; // surface sector: nothing to book between the two cities
    const a = nodes[i - 1];
    const b = nodes[i];
    legs.push({ o: a.kind === 'place' ? a.code : '', d: b.kind === 'place' ? b.code : '', from: a, to: b });
  }
  return nodes.length >= 2 && legs.length ? { nodes, legs } : null;
}

/**
 * @param {string} text the pasted post
 * @param {{ fx?: object }} [ctx]
 * @returns {{ error: 'empty' | 'unreadable' | 'china' } | { ok: true, routes: object[], airlines: string[], kinds: string[], cabin: string|null, price: object|null, playbook: string|null, summary: string }}
 */
export function parsePost(text, { fx = null } = {}) {
  const raw = String(text ?? '').replace(/\r/g, '').trim();
  if (raw.length < 4) return { error: 'empty' };
  if (mentionsChina(raw)) return { error: 'china' };
  const lines = raw.split('\n').map((l) => l.trim());
  const routeAt = [];
  lines.forEach((l, i) => {
    const r = l && parseRouteLine(l);
    if (r) routeAt.push([i, l, r]);
  });
  const routes = routeAt.map(([i, line, r], k) => {
    const stop = routeAt[k + 1]?.[0] ?? lines.length;
    const next = i + 1 < stop ? lines[i + 1] : '';
    const block = findPrices(next).length ? `${line} ${next}` : line;
    const p = findPrices(block)[0] || null;
    const bags = BAGS_NO.test(block) ? false : BAGS_YES.test(block) ? true : null;
    return {
      line,
      nodes: r.nodes,
      legs: r.legs,
      price: p ? { amount: p.amount, currency: p.currency, twd: toTWD(p.amount, p.currency, fx) } : null,
      bags,
      cabin: detectCabin(block),
    };
  });
  // No route lines: read the first line the way a deal title is read.
  if (!routes.length) {
    const head = lines.find(Boolean) || '';
    const r = extractRoute(head);
    const p = findPrices(raw)[0] || null;
    if (r.o || r.d) {
      const nodes = [r.o, r.d].filter(Boolean).map((x) => ({ code: x.code, kind: x.kind, text: x.code, gap: false }));
      routes.push({
        line: head, nodes, legs: nodes.length > 1 ? [{ o: r.o.kind === 'place' ? r.o.code : '', d: r.d.kind === 'place' ? r.d.code : '', from: nodes[0], to: nodes[1] }] : [],
        price: p ? { amount: p.amount, currency: p.currency, twd: toTWD(p.amount, p.currency, fx) } : null, bags: null, cabin: detectCabin(raw),
      });
    }
  }
  if (!routes.length && !findPrices(raw).length) return { error: 'unreadable' };
  const kinds = detectKinds(raw);
  const flown = routes.filter((r) => r.price);
  const first = routes[0]?.nodes[0];
  if (first && ((first.kind === 'place' && EX_STATIONS.has(first.code)) || (first.kind === 'country' && first.code !== 'TW' && APAC_COUNTRIES.has(first.code))) && !kinds.includes('ex-station')) kinds.push('ex-station');
  if (routes.some((r) => r.legs.length >= 3) && !kinds.includes('multi-city')) kinds.push('multi-city');
  const airlines = airlinesIn(raw);
  const cheapest = flown.length ? flown.reduce((a, b) => ((a.price.twd ?? Infinity) <= (b.price.twd ?? Infinity) ? a : b)).price : null;
  return {
    ok: true,
    routes,
    airlines,
    alliance: airlines.length && airlines.every((c) => allianceOf(c) === allianceOf(airlines[0])) ? allianceOf(airlines[0]) : null,
    kinds,
    // Only when every priced example agrees: "…or pick business class for the return" in the chatter is a hint, not the fare's cabin.
    cabin: flown.length && flown.every((r) => r.cabin && r.cabin === flown[0].cabin) ? flown[0].cabin : null,
    cabinHint: detectCabin(raw),
    price: cheapest,
    playbook: playbookFor(kinds),
    summary: clip(lines.filter(Boolean).slice(0, 3).join(' '), 200),
  };
}

// Airports to suggest when a stop in a post is only a country or a region ("菲律賓", "歐洲").
const REGION_AIRPORTS = {
  EU: ['FCO', 'CDG', 'AMS', 'LHR', 'FRA', 'MXP', 'MAD', 'VIE'], NA: ['LAX', 'SFO', 'JFK', 'SEA', 'ORD', 'YVR'], 'US-E': ['JFK', 'BOS', 'IAD', 'ORD'], 'US-W': ['LAX', 'SFO', 'SEA'],
  OC: ['SYD', 'MEL', 'AKL', 'BNE'], OCNZ: ['SYD', 'MEL', 'AKL'], SEA: ['BKK', 'SIN', 'MNL', 'KUL', 'SGN'], ASIA: ['NRT', 'ICN', 'BKK', 'SIN'], ME: ['DXB', 'DOH', 'AUH', 'IST'],
  AF: ['JNB', 'CAI', 'NBO', 'ADD'], LATAM: ['MEX', 'GRU', 'LIM', 'BOG'],
};
export function suggestAirports(kind, code) {
  if (kind === 'region') return REGION_AIRPORTS[code] || [];
  if (kind === 'country') {
    const list = Object.entries(AIRPORTS).filter(([, a]) => a.country === code).map(([c]) => c);
    return code === 'PH' ? ['MNL', 'CRK', 'CEB', ...list.filter((c) => !['MNL', 'CRK', 'CEB'].includes(c))].slice(0, 6) : list.slice(0, 6);
  }
  return [];
}

/**
 * A route from a post as a search the form can start from. Stops that are only a country / region (「菲律賓」「歐洲」) have no
 * airport yet: they are listed in `wild` with suggestions, and `bind[i] = [fromNode, toNode]` says which stops each leg joins,
 * so choosing an airport for a stop fills every leg that touches it. Dates are left blank for the person to pick.
 */
export function routeToSearch(route) {
  const legs = route.legs;
  const same = legs.length === 2 && legs[0].o && legs[0].o === legs[1].d && legs[0].d === legs[1].o;
  const trip = legs.length === 1 ? 'ow' : same ? 'rt' : 'mc';
  const wild = [];
  for (const n of route.nodes) {
    if (n.kind !== 'place' && legs.some((l) => l.from.idx === n.idx || l.to.idx === n.idx)) {
      wild.push({ node: n.idx, kind: n.kind, code: n.code, text: n.text, suggestions: suggestAirports(n.kind, n.code) });
    }
  }
  return {
    trip,
    o: legs[0].o, d: legs[0].d, depart: '', return: '',
    segs: trip === 'mc' ? legs.map((l) => ({ o: l.o, d: l.d, date: '' })) : undefined,
    wild,
    bind: legs.map((l) => [l.from.idx, l.to.idx]),
  };
}
