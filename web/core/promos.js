// Promotions, bonuses and status matches of airlines AND hotels (and cruise lines / car rental — status matches cross industries).
//
//   classifyPromo(rawFeedItem) → { item } | { drop: 'china' | 'stale' | 'expired' | 'no-brand' | 'card' | 'not-promo' }
//
// A promo item says WHO (brands: airline / hotel / cruise / car, with the wallet program they belong to), WHAT (kinds), UNTIL WHEN
// (validTo, parsed from the text) and FOR WHOM (lock: "US residents only", "targeted"). Credit-card sign-up offers are not promos
// here: they are US-bank products, not something an airline or hotel runs for its members.
import { PROGRAMS } from './programs.js';
import { AIRLINES, allianceOf } from './airlines.js';
import { makeMatcher } from './places.js';
import { airlinesIn, mentionsChina } from './community.js';

export const PROMO_KINDS = ['status-match', 'route-promo', 'fare-sale', 'bonus-miles', 'award-sale'];

// ───────────────────────── brands ─────────────────────────
// Extra names beyond PROGRAMS' own (en / zh / ko): the short forms writers actually use.
const PROGRAM_NICKNAMES = {
  MARRIOTT: ['marriott', 'bonvoy', '萬豪', '万豪', '메리어트'],
  HILTON: ['hilton', '希爾頓', '힐튼'],
  HYATT: ['hyatt', '凱悅', '하얏트'],
  IHG: ['ihg', 'holiday inn', 'intercontinental', '洲際', '假日酒店'],
  ACCOR: ['accor', 'all accor', 'sofitel', 'novotel', 'ibis', '雅高', '아코르'],
  WYNDHAM: ['wyndham', '溫德姆'],
  RADISSON: ['radisson', '麗笙'],
  SHANGRILA: ['shangri-la', 'shangri la', '香格里拉'],
  HERTZ: ['hertz'],
  AVIS: ['avis'],
  AFKL: ['flying blue', 'air france-klm', 'air france klm', 'air france', 'klm'],
  DL: ['skymiles', 'delta'],
  UA: ['mileageplus', 'united airlines', 'united'],
  AA: ['aadvantage', 'american airlines'],
  BA: ['avios', 'british airways', 'executive club'],
  AS: ['atmos rewards', 'atmos', 'alaska airlines', 'mileage plan'],
  QR: ['qatar airways', 'qatar privilege', 'qatar'],
  SQ: ['krisflyer', 'singapore airlines'],
  TK: ['miles&smiles', 'miles & smiles', 'turkish airlines'],
  LH: ['miles & more', 'miles&more', 'lufthansa'],
  EK: ['skywards', 'emirates'],
  EY: ['etihad guest', 'etihad'],
  CI: ['dynasty flyer', 'china airlines', '華航', '華夏'],
  BR: ['infinity mileagelands', 'eva air', '長榮', '無限萬哩遊'],
  JX: ['cosmile', 'starlux', '星宇'],
};
const CRUISE_NAMES = ['royal caribbean', 'celebrity cruises', 'norwegian cruise', 'msc cruises', 'explora journeys', 'explora club', 'carnival cruise', 'princess cruises', 'holland america', 'cunard', 'viking cruises', 'costa cruises', '郵輪', '遊輪'];

const entries = [];
for (const [key, p] of Object.entries(PROGRAMS)) {
  const id = key;
  for (const n of [p.en, p.zh, p.ko]) entries.push([n, { id, kind: p.kind === 'airline' ? 'airline' : p.kind, program: key, carrier: p.carrier || null }]);
}
for (const [key, names] of Object.entries(PROGRAM_NICKNAMES)) {
  const p = PROGRAMS[key];
  for (const n of names) entries.push([n, { id: key, kind: p.kind === 'airline' ? 'airline' : p.kind, program: key, carrier: p.carrier || null }]);
}
for (const n of CRUISE_NAMES) entries.push([n, { id: 'CRUISE', kind: 'cruise', program: null, carrier: null }]);
const brandMatcher = makeMatcher(entries);

/** Brands in a text, first mention first: [{ id, kind: 'airline'|'hotel'|'car'|'cruise', program, carrier }]. */
export function brandsIn(text) {
  const out = [];
  const add = (b) => {
    if (!out.some((x) => x.id === b.id)) out.push(b);
  };
  const named = brandMatcher(text);
  // Airlines named plainly ("Korean Air", "Delta") have a loyalty program of the same carrier; keep order of appearance.
  const air = airlinesIn(text);
  const hits = [...named.map((h) => ({ at: h.index, b: h.value }))];
  for (const code of air) {
    const programKey = Object.keys(PROGRAMS).find((k) => PROGRAMS[k].carrier === code);
    const idx = text.toLowerCase().indexOf((AIRLINES[code]?.en || code).toLowerCase().replace(/\s*\(.*$/, ''));
    hits.push({ at: idx < 0 ? 1e6 : idx, b: { id: programKey || code, kind: 'airline', program: programKey || null, carrier: code } });
  }
  hits.sort((a, b) => a.at - b.at);
  for (const h of hits) add(h.b);
  return out;
}

// ───────────────────────── kinds ─────────────────────────
const PROMO_RULES = [
  ['status-match', /status[- ]match|match(?:es|ed|ing)?\s+(?:your\s+)?(?:elite\s+)?status|status challenge|fast[- ]?track|(?:instant|complimentary|free)\s+(?:elite\s+|gold\s+|silver\s+|platinum\s+)?status|status (?:gift|boost|extension|upgrade)|elite (?:match|status for)|會籍.{0,6}(?:對等|匹配|挑戰|升級)|會籍挑戰|等級挑戰|등급\s?매치|등급\s?챌린지|status\s?challenge/i],
  ['route-promo', /new route|inaugural|launch(?:es|ing)? (?:non-?stop|service|flights|a new)|(?:non-?stop|direct) (?:service|flights) (?:to|from|between)|resum(?:es|ing|ption)|開航|新航線|復航|취항|신규\s?노선/i],
  ['fare-sale', /\bsale\b|% off|\bdiscount|fare (?:sale|deal)|promo fares?|flash|from [$€£]\s?\d|special offer|limited[- ]time|特價|折扣|優惠|促銷|買一送一|할인|특가|セール/i],
  ['bonus-miles', /(?:\d+%|double|triple|2x|3x|4x|bonus)\D{0,40}(?:miles|points|avios|tier points|elite qualifying)|(?:miles|points|avios)\b\D{0,30}(?:\d+%\s*)?bonus|transfer bonus|\bbuy\b.{0,40}\b(?:miles|points|avios)\b|(?:miles|points) sale|(?:miles|points) bonus|里程加碼|哩程加倍|點數加碼|마일리지\s?보너스/i],
  ['award-sale', /award (?:sale|discount|flash)|(?:saver|promo) awards?|off-?peak awards?|promo rewards|獎勵機票優惠|보너스\s?항공권/i],
];
export function detectPromoKinds(text, categories = []) {
  const s = `${text} ${categories.join(' ')}`;
  const kinds = PROMO_RULES.filter(([, re]) => re.test(s)).map(([k]) => k);
  if (categories.some((c) => /status match/i.test(c)) && !kinds.includes('status-match')) kinds.unshift('status-match');
  return kinds;
}

const CARD = /\b(?:credit|debit|charge) cards?\b|\bcard\b.{0,30}\b(?:offer|bonus|review|perks?)|sign[- ]?up bonus|welcome (?:offer|bonus|gift)|annual fee|referral|\bamex\b|american express|mastercard|\bvisa\b|信用卡|聯名卡|카드/i;
// Forum chatter ("Do some flights never have saver awards?") mentions the same words as a promotion but is not one.
const QUESTION = /^(?:do|does|did|is|are|was|can|could|how|why|what|which|when|has anyone|anyone|should|would|will|any)\b/i;
const EXPIRED = /\[(?:expired|ended|dead|expired?\s)[^\]]*\]|\bexpired\b|\bhas ended\b|\bended\b/i;

// ───────────────────────── who can use it ─────────────────────────
const LOCKS = [
  ['US', /\bU\.?S\.?(?:A)?\b(?:\s+(?:residents?|only|customers|members?|travelers?|accounts?))|only (?:for|available (?:to|in)) (?:the )?U\.?S\.?|\[(?:US|U\.S\.|USA|[A-Z][a-z]+ State|Texas|California|New York)\]|united states (?:residents?|only)|\bin the (?:US|U\.S\.)\b/i],
  ['CA', /canad(?:a|ian)s?\s+(?:residents?|only)|only (?:for|in) canad|\[CA\]/i],
  ['UK', /\bU\.?K\.?\s+(?:residents?|only|customers)|only (?:for|in) (?:the )?U\.?K\.?|\[UK\]/i],
  ['AU', /australi(?:a|an)s?\s+(?:residents?|only)|\[AU\]/i],
  ['SG', /singapore(?:ans?)?\s+(?:residents?|only)|\[SG\]/i],
  ['IN', /\bindian?\s+(?:residents?|only)|\[IN\]/i],
  ['EU', /\bEU\s+(?:residents?|only)|european\s+(?:residents?|only)/i],
  ['TARGETED', /\[targeted\]|targeted offer|invitation only|by invitation|selected members|\[ymmv\]/i],
];
export function detectLocks(text) {
  return LOCKS.filter(([, re]) => re.test(text)).map(([c]) => c);
}
/** Can a Taiwan-based person plausibly use it? A lock to another country says no; "targeted" says maybe. */
export const usableFromTaiwan = (locks) => !locks.some((l) => l !== 'TARGETED');

// ───────────────────────── "until when" ─────────────────────────
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DOW = '(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\\.?,?\\s+';
const END_WORD = '(?:until|through|thru|till|til|ends?|ending|ends on|expires?(?: on)?|expiring|expiration|deadline|extended(?: to| until| through)?|valid (?:until|through|till)|good (?:until|through)|by|before)';
const DATE_MD = new RegExp(`${END_WORD}\\s+(?:${DOW})?${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'i');
const DATE_DM = new RegExp(`${END_WORD}\\s+(?:${DOW})?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\.?(?:,?\\s+(\\d{4}))?`, 'i');
const DATE_SLASH = new RegExp(`${END_WORD}\\s+(?:${DOW})?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?`, 'i');
const MON_NC = MON.replace('(jan', '(?:jan'); // the same names without a capture group
const DATE_RANGE = new RegExp(`(?:from|between)\\s+(?:${DOW})?(?:${MON_NC}\\.?\\s+\\d{1,2}|\\d{1,2}\\s+${MON_NC})(?:st|nd|rd|th)?[^.]{0,12}?(?:to|-|–|through|until|and)\\s+(?:${DOW})?(?:${MON}\\.?\\s+(\\d{1,2})|(\\d{1,2})\\s+${MON})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'i');
const DATE_ISO = new RegExp(`${END_WORD}\\s+(\\d{4})-(\\d{2})-(\\d{2})`, 'i');
const DATE_CJK = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?\s*(?:止|前|截止|結束|到期|為止)|(?:至|到|截止(?:日期)?[:：]?)\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/;
const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const RELATIVE = /\bends?\s+(tonight|today|tomorrow|(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?)\b/i;

const ymd = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);

/**
 * "Ends Tuesday", "through October 31", "[Extended 1/15/27]", "valid from Oct 1 to Nov 15", "10月31日止" → ISO date, or null.
 * A missing year is the next one that puts the date on/after the post's own date.
 */
export function parseValidTo(text, publishedIso) {
  const s = String(text ?? '');
  const pub = publishedIso ? publishedIso.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const pubY = Number(pub.slice(0, 4));
  // No year: a date a few days behind the post is simply this year's; one that has "wrapped" past the new year ("through
  // January 5" in a December post) belongs to next year; a date months behind is an offer that has already ended.
  const yearFor = (y, m, d) => {
    if (y) return y < 100 ? 2000 + y : y;
    const cand = ymd(pubY, m, d);
    if (!cand) return pubY;
    const diff = (Date.parse(cand) - Date.parse(pub)) / 86400000;
    return diff < -7 && diff + 365 <= 120 ? pubY + 1 : pubY;
  };
  let m;
  if ((m = DATE_ISO.exec(s))) return ymd(m[1], Number(m[2]), Number(m[3]));
  if ((m = DATE_RANGE.exec(s))) {
    const mon = MONTHS[(m[1] || m[4]).slice(0, 3).toLowerCase()];
    const day = Number(m[2] || m[3]);
    return ymd(yearFor(m[5] && Number(m[5]), mon, day), mon, day);
  }
  if ((m = DATE_MD.exec(s))) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return ymd(yearFor(m[3] && Number(m[3]), mon, Number(m[2])), mon, Number(m[2]));
  }
  if ((m = DATE_DM.exec(s))) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return ymd(yearFor(m[3] && Number(m[3]), mon, Number(m[1])), mon, Number(m[1]));
  }
  if ((m = DATE_SLASH.exec(s))) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    if (a > 12) [a, b] = [b, a]; // d/m
    return ymd(yearFor(m[3] && Number(m[3]), a, b), a, b);
  }
  if ((m = DATE_CJK.exec(s))) {
    const y = m[1] || m[4];
    const mo = Number(m[2] || m[5]);
    const d = Number(m[3] || m[6]);
    return ymd(yearFor(y && Number(y), mo, d), mo, d);
  }
  if ((m = RELATIVE.exec(s))) {
    const w = m[1].toLowerCase();
    if (w === 'tonight' || w === 'today') return pub;
    const base = new Date(`${pub}T00:00:00Z`);
    if (w === 'tomorrow') return new Date(base.getTime() + 86400000).toISOString().slice(0, 10);
    const target = WEEKDAYS[w.slice(0, 3)];
    const diff = (target - base.getUTCDay() + 7) % 7;
    return new Date(base.getTime() + diff * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

/** "Flying Blue promo rewards - Oct 2026": a promotion named for a month runs to the end of that month. */
function monthEnd(title, publishedIso, kinds) {
  if (!kinds.some((k) => ['award-sale', 'fare-sale', 'bonus-miles'].includes(k))) return null;
  const m = new RegExp(`\\b${MON}\\s+(\\d{4})\\b`, 'i').exec(title);
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  const y = Number(m[2]);
  const last = new Date(Date.UTC(y, mon, 0)).toISOString().slice(0, 10);
  return publishedIso && last < publishedIso.slice(0, 10) ? null : last;
}

// ───────────────────────── relevance ─────────────────────────
const KIND_WEIGHT = { 'status-match': 20, 'route-promo': 8, 'fare-sale': 12, 'bonus-miles': 6, 'award-sale': 8 };

export function promoRelevance(item, { today } = {}) {
  let r = 30;
  r += Math.max(0, ...item.kinds.map((k) => KIND_WEIGHT[k] || 0));
  if (item.brands.some((b) => b.carrier && allianceOf(b.carrier) === 'SKYTEAM')) r += 6;
  if (item.brands.some((b) => ['CI', 'BR', 'JX', 'KE', 'SQ', 'JL', 'NH'].includes(b.carrier))) r += 4;
  if (item.brands.some((b) => b.kind === 'hotel' || b.kind === 'airline')) r += 2;
  if (item.mentionsTaiwan) r += 12;
  if (item.lock?.length && !usableFromTaiwan(item.lock)) r -= 25;
  if (item.lock?.includes('TARGETED')) r -= 6;
  if (item.validTo && today) {
    const left = (Date.parse(item.validTo) - Date.parse(today)) / 86400000;
    if (left >= 0 && left <= 7) r += 4;
  }
  if (today && item.published) {
    const age = (Date.parse(`${today}T12:00:00Z`) - Date.parse(item.published)) / 86400000;
    r += age <= 1.5 ? 6 : age <= 4 ? 3 : age >= 14 ? -8 : 0;
  }
  return Math.max(0, Math.min(99, Math.round(r)));
}

const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);

/**
 * Classify one feed item as a promotion.
 * @param {{ id, title, url, published, summary, categories }} raw
 * @param {{ source?: object, today?: string, maxAgeDays?: number }} ctx
 */
export function classifyPromo(raw, ctx = {}) {
  const { source = {}, today = null, maxAgeDays = 30 } = ctx;
  const title = String(raw.title || '');
  const body = String(raw.summary || '');
  const text = `${title}. ${body.slice(0, 900)}`;
  if (mentionsChina(title) || mentionsChina(body.slice(0, 500))) return { drop: 'china' };
  if (EXPIRED.test(title)) return { drop: 'expired' };
  if (QUESTION.test(title.trim())) return { drop: 'not-promo' };
  const kinds = detectPromoKinds(text, raw.categories || []);
  // A status match stays useful for months; sales and bonuses are old news after a few weeks.
  const limit = kinds.includes('status-match') ? Math.max(maxAgeDays, 120) : maxAgeDays;
  if (today && raw.published && (Date.parse(`${today}T12:00:00Z`) - Date.parse(raw.published)) / 86400000 > limit) return { drop: 'stale' };

  const brands = brandsIn(title).length ? brandsIn(title) : brandsIn(text);
  if (!brands.length) return { drop: 'no-brand' };
  if (!kinds.length) return { drop: 'not-promo' };
  if (CARD.test(title) && !kinds.includes('status-match')) return { drop: 'card' };

  const validTo = parseValidTo(`${title}. ${body.slice(0, 700)}`, raw.published) || monthEnd(title, raw.published, kinds);
  if (validTo && today && validTo < today) return { drop: 'expired' };
  const lock = detectLocks(`${title} ${body.slice(0, 400)}`);
  const category = brands[0].kind;
  const item = {
    id: raw.id,
    src: source.id || null,
    url: raw.url,
    title,
    published: raw.published,
    summary: clip(body.replace(/\s*\[…\]\s*$/, ''), 260),
    kinds: PROMO_KINDS.filter((k) => kinds.includes(k)),
    category,
    brands: brands.slice(0, 4),
    validTo,
    lock,
    mentionsTaiwan: /taiwan|taipei|台灣|臺灣|台北/i.test(text),
  };
  item.relevance = promoRelevance(item, { today });
  return { item };
}

/** Which of the items touch a program the person holds (wallet entries have a `program` key). */
export function relatedToWallet(item, members = []) {
  const held = new Set(members.map((m) => m.program).filter(Boolean));
  return item.brands.filter((b) => (b.program && held.has(b.program)) || (b.carrier && members.some((m) => PROGRAMS[m.program]?.carrier === b.carrier)));
}
