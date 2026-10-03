// Place names ⇄ IATA codes, shared by the PWA (search boxes, "paste a post") and the scanner (deal classifier).
//
//   • parsePlaces('tyo, hnd')  → the airports a search box may hold (a city code expands to its airports)
//   • findPlaces(text)         → every airport / city / country / region mentioned in a free-text post, in order
//   • mentionsChinaPlace(text) → mainland China / Hong Kong / Macau place names — same zero-tolerance policy as the fares
//
// Names are matched in Traditional Chinese, English and Korean. Airports come from AIRPORTS; the alias table below adds the
// names people actually write in posts ("紐約", "Bali", "Saigon", "普吉").
// NB: no regex look-behind anywhere — Safari before 16.4 fails to even parse it, which would take the whole app down.
import { AIRPORTS, BLOCKED_AIRPORTS } from './airports.js';

export const MAX_PLACES = 4;

/** Metropolitan city codes → their airports. Google Flights / SerpApi accept a comma-separated list per endpoint. */
export const CITY_GROUPS = {
  TYO: ['NRT', 'HND'],
  OSA: ['KIX', 'ITM'],
  SEL: ['ICN', 'GMP'],
  NYC: ['JFK', 'EWR', 'LGA'],
  LON: ['LHR', 'LGW', 'STN', 'LTN'],
  PAR: ['CDG', 'ORY'],
  MIL: ['MXP', 'LIN'],
  ROM: ['FCO', 'CIA'],
  WAS: ['IAD', 'DCA', 'BWI'],
  CHI: ['ORD', 'MDW'],
};

const GROUP_NAMES = {
  TYO: ['Tokyo', '東京', '도쿄'], OSA: ['Osaka', '大阪', '오사카'], SEL: ['Seoul', '首爾', '서울'], NYC: ['New York', '紐約', '뉴욕'],
  LON: ['London', '倫敦', '런던'], PAR: ['Paris', '巴黎', '파리'], MIL: ['Milan', '米蘭', '밀라노'], ROM: ['Rome', '羅馬', '로마'],
  WAS: ['Washington', '華盛頓', '워싱턴'], CHI: ['Chicago', '芝加哥', '시카고'],
};

// code: aliases (English lower-case · 中文 · 한국어), separated by "|". A city code (TYO…) stands for all its airports.
const ALIASES = `
TPE: taipei|taiwan taoyuan|taoyuan|台北|臺北|桃園機場|타이베이
KHH: kaohsiung|高雄|가오슝
TYO: tokyo|東京|东京|도쿄
OSA: osaka|大阪|오사카
SEL: seoul|首爾|首尔|서울
PUS: busan|pusan|釜山|부산
CJU: jeju|濟州|제주
CTS: sapporo|hokkaido|札幌|北海道|삿포로|홋카이도
FUK: fukuoka|福岡|후쿠오카
OKA: okinawa|naha|沖繩|沖绳|那霸|오키나와
NGO: nagoya|名古屋|나고야
BKK: bangkok|曼谷|방콕
HKT: phuket|普吉島|普吉岛|普吉|푸껫
CNX: chiang mai|清邁|치앙마이
SGN: ho chi minh|saigon|胡志明|西貢|호치민
HAN: hanoi|河內|하노이
DAD: da nang|danang|峴港|다낭
MNL: manila|馬尼拉|마닐라
CRK: clark|angeles|mabalacat|克拉克|安吉利斯|클라크
CEB: cebu|宿霧|세부
KLO: boracay|kalibo|長灘島|长滩岛|보라카이
SIN: singapore|新加坡|싱가포르
KUL: kuala lumpur|吉隆坡|쿠알라룸푸르
DPS: bali|denpasar|峇里島|峇里|巴厘島|발리
CGK: jakarta|雅加達|자카르타
DEL: delhi|new delhi|德里|델리
BOM: mumbai|bombay|孟買|뭄바이
CMB: colombo|可倫坡|콜롬보
MLE: maldives|male|馬爾地夫|몰디브
DXB: dubai|杜拜|두바이
AUH: abu dhabi|阿布達比|아부다비
DOH: doha|杜哈|도하
IST: istanbul|伊斯坦堡|이스탄불
NYC: new york|nyc|manhattan|紐約|纽约|뉴욕
LAX: los angeles|洛杉磯|洛杉矶|로스앤젤레스
SFO: san francisco|舊金山|旧金山|샌프란시스코
SEA: seattle|西雅圖|西雅图|시애틀
YVR: vancouver|溫哥華|温哥华|밴쿠버
YYZ: toronto|多倫多|多伦多|토론토
HNL: honolulu|hawaii|檀香山|夏威夷|하와이|호놀룰루
LON: london|倫敦|伦敦|런던
PAR: paris|巴黎|파리
AMS: amsterdam|阿姆斯特丹|암스테르담
FRA: frankfurt|法蘭克福|프랑크푸르트
MUC: munich|慕尼黑|뮌헨
VIE: vienna|維也納|비엔나
PRG: prague|布拉格|프라하
BUD: budapest|布達佩斯|부다페스트
ROM: rome|羅馬|罗马|로마
MIL: milan|米蘭|米兰|밀라노
VCE: venice|威尼斯|베네치아
ZRH: zurich|蘇黎世|취리히
BCN: barcelona|巴塞隆納|巴塞罗那|바르셀로나
MAD: madrid|馬德里|마드리드
LIS: lisbon|里斯本|리스본
KEF: iceland|reykjavik|keflavik|冰島|冰岛|雷克雅維克|아이슬란드
CPH: copenhagen|哥本哈根|코펜하겐
ARN: stockholm|斯德哥爾摩|스톡홀름
ATH: athens|雅典|아테네
SYD: sydney|雪梨|悉尼|시드니
MEL: melbourne|墨爾本|멜버른
BNE: brisbane|布里斯本|브리즈번
AKL: auckland|奧克蘭|오클랜드
GUM: guam|關島|괌
ROR: palau|帛琉|팔라우
CUN: cancun|坎昆|칸쿤
MEX: mexico city|墨西哥城|멕시코시티
`;

const CJK = /[㐀-鿿가-힯]/;

/** Region words. Regions are not airports, but they tell a lot about where a deal goes. */
export const REGION_WORDS = {
  europe: 'EU', european: 'EU', 歐洲: 'EU', 欧洲: 'EU', 유럽: 'EU',
  asia: 'ASIA', 亞洲: 'ASIA', 亚洲: 'ASIA', 아시아: 'ASIA',
  'southeast asia': 'SEA', 東南亞: 'SEA', 东南亚: 'SEA', 동남아: 'SEA',
  'north america': 'NA', 北美: 'NA', 북미: 'NA',
  oceania: 'OC', 大洋洲: 'OC', 오세아니아: 'OC',
  'middle east': 'ME', 中東: 'ME', 中东: 'ME', 중동: 'ME',
  africa: 'AF', 非洲: 'AF', 아프리카: 'AF',
  'south america': 'LATAM', 南美: 'LATAM', 'latin america': 'LATAM', 中南美: 'LATAM',
  美東: 'US-E', 美东: 'US-E', 'us east coast': 'US-E', 'east coast': 'US-E',
  美西: 'US-W', 'us west coast': 'US-W', 'west coast': 'US-W',
  紐澳: 'OCNZ', 纽澳: 'OCNZ',
};

// ── Text helpers (diacritics folded so "Málaga", "Cancún", "Kraków" match their plain spelling) ──
// NFC afterwards: NFD alone would split Hangul syllables into jamo and the Korean names would never match.
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compile alias keys into one Latin regex (ASCII word boundaries) and one CJK regex (no boundaries needed). */
function compile(keys) {
  const sorted = [...new Set(keys.map((k) => fold(k).toLowerCase()))].sort((a, b) => b.length - a.length);
  const latin = sorted.filter((k) => !CJK.test(k) && /^[a-z0-9][a-z0-9 .'-]*[a-z0-9]$/.test(k));
  const cjk = sorted.filter((k) => CJK.test(k));
  return {
    latin: latin.length ? new RegExp(`\\b(?:${latin.map(escapeRe).join('|')})\\b`, 'gi') : null,
    cjk: cjk.length ? new RegExp(cjk.map(escapeRe).join('|'), 'g') : null,
  };
}
function scan(compiled, text) {
  const out = [];
  const s = fold(text);
  for (const re of [compiled.latin, compiled.cjk]) {
    if (!re) continue;
    re.lastIndex = 0;
    for (const m of s.matchAll(re)) out.push({ text: m[0].toLowerCase(), index: m.index });
  }
  return out;
}

// ── Build the lookup tables once ──
const SUFFIX_EN = /\s+(Narita|Haneda|Kansai|Itami|Incheon|Gimpo|Songshan|Taoyuan|Orly|Gatwick|Stansted|Luton|Newark|LaGuardia|Reagan|Midway|Linate|Ciampino|Don Mueang|Techo|JFK|\(.*\))$/i;
const SUFFIX_ZH = /(成田|羽田|關西|伊丹|仁川|金浦|松山|桃園|奧利|蓋威克|廊曼|紐華克|德崇|史坦斯特|盧頓|利納特|欽皮諾|拉瓜迪亞|雷根|中途島)$/;

const byAlias = new Map(); // folded lower-cased alias → code (airport or city code)
const add = (alias, code) => {
  const k = fold(alias).trim().toLowerCase();
  if (k.length < 2 || byAlias.has(k)) return;
  byAlias.set(k, code);
};
const groupOf = (code) => Object.entries(CITY_GROUPS).find(([, list]) => list.includes(code))?.[0] || null;

// 1) curated aliases first (they win over derived names)
for (const line of ALIASES.trim().split('\n')) {
  const [code, names] = line.split(':');
  for (const n of names.split('|')) add(n, code.trim());
}
// 2) names derived from the airport table
for (const [code, a] of Object.entries(AIRPORTS)) {
  const target = groupOf(code) || code;
  const stripParen = (s) => s.replace(/\s*[(（].*?[)）]\s*/g, '').trim();
  add(a.en, code);
  add(stripParen(a.en), target);
  add(a.en.replace(SUFFIX_EN, ''), target);
  add(a.zh, code);
  add(stripParen(a.zh).replace(SUFFIX_ZH, ''), target);
  add(stripParen(a.ko), target);
}
for (const [g, names] of Object.entries(GROUP_NAMES)) for (const n of names) add(n, g);

const PLACES = compile([...byAlias.keys()]);
const REGIONS = compile(Object.keys(REGION_WORDS));

// Country names via Intl (en / zh-Hant / ko), so "Philippines", "菲律賓", "필리핀" all resolve to PH.
const countryByName = new Map();
try {
  const names = ['en', 'zh-Hant', 'ko'].map((l) => new Intl.DisplayNames([l], { type: 'region' }));
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const x of A) {
    for (const y of A) {
      const code = x + y;
      for (const dn of names) {
        const n = dn.of(code);
        if (n && n !== code && n.length >= 2) countryByName.set(fold(n).toLowerCase(), code);
      }
    }
  }
  // Names people use that Intl spells differently.
  for (const [n, c] of [['usa', 'US'], ['america', 'US'], ['美國', 'US'], ['uk', 'GB'], ['britain', 'GB'], ['england', 'GB'], ['台灣', 'TW'], ['臺灣', 'TW'], ['taiwan', 'TW'],
    ['korea', 'KR'], ['韓國', 'KR'], ['日本', 'JP'], ['泰國', 'TH'], ['越南', 'VN'], ['菲律賓', 'PH'], ['新加坡', 'SG'], ['馬來西亞', 'MY'], ['印尼', 'ID']]) {
    countryByName.set(n, c);
  }
} catch {
  /* Intl.DisplayNames unavailable: country names just won't be recognised */
}
// Two-letter keys are far too ambiguous ("uk" is fine, "in" or "is" are not): keep 3+ letters, 2+ for CJK.
const COUNTRIES = compile([...countryByName.keys()].filter((k) => (CJK.test(k) ? k.length >= 2 : k.length >= 3)));

// ── Public helpers ──
const IATA = /^[A-Z]{3}$/;

/**
 * What a search box holds: "TYO", "nrt hnd", ["TPE"] → { codes: ['NRT','HND'] } or { error }.
 * Errors: 'airport' (not a 3-letter code) · 'blocked-airport' (mainland China / Hong Kong / Macau) · 'too-many'.
 */
export function parsePlaces(input, { max = MAX_PLACES } = {}) {
  const tokens = (Array.isArray(input) ? input : String(input ?? '').split(/[\s,;/]+/)).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  if (!tokens.length) return { error: 'airport' };
  const codes = [];
  for (const tok of tokens) {
    if (!IATA.test(tok)) return { error: 'airport' };
    for (const c of CITY_GROUPS[tok] || [tok]) {
      if (BLOCKED_AIRPORTS.has(c)) return { error: 'blocked-airport' };
      if (!codes.includes(c)) codes.push(c);
    }
  }
  if (codes.length > max) return { error: 'too-many' };
  return { codes };
}

/** ['NRT','HND'] | 'NRT,HND' → 'NRT,HND' (what SerpApi and the tracker store) */
export const placeString = (codes) => placeList(codes).join(',');
export const placeList = (value) => (Array.isArray(value) ? value : String(value || '').split(',')).map((s) => String(s).trim().toUpperCase()).filter(Boolean);

/** Human label: one airport → its city, a whole city (all of TYO's airports) → the city, otherwise the airports. */
export function placeLabel(value, lang = 'zh-TW') {
  const codes = placeList(value).flatMap((c) => CITY_GROUPS[c] || [c]);
  const idx = lang.startsWith('zh') ? 1 : lang.startsWith('ko') ? 2 : 0;
  if (!codes.length) return '';
  const g = Object.entries(CITY_GROUPS).find(([, list]) => list.length === codes.length && list.every((c) => codes.includes(c)));
  if (g) return GROUP_NAMES[g[0]][idx];
  const name = (c) => {
    const a = AIRPORTS[c];
    return a ? [a.en, a.zh, a.ko][idx] : c;
  };
  return codes.map(name).join(' / ');
}

/** ISO country of an airport / city code, or null. */
export function countryOf(code) {
  const c = String(code || '').toUpperCase();
  if (AIRPORTS[c]) return AIRPORTS[c].country;
  const first = CITY_GROUPS[c]?.[0];
  return first && AIRPORTS[first] ? AIRPORTS[first].country : null;
}

const knownCode = (c) => !!(AIRPORTS[c] || CITY_GROUPS[c] || BLOCKED_AIRPORTS.has(c));
// "TPE-JFK", "TPE → JFK", "TPE to JFK" — a bare 3-letter code only counts when it sits in a route like this.
const ROUTE_PAIR = /(?:^|[^A-Za-z])([A-Z]{3})\s*(?:-|–|—|→|➔|>|\/|to)\s*([A-Z]{3})(?![A-Za-z])/g;
const PAREN_CODE = /[(（]([A-Z]{3})[)）]/g;

/**
 * Everything in `text` that names a place, in reading order. kind: 'place' (airport or city code) · 'country' · 'region'.
 * Bare 3-letter codes only count in route-like contexts ("TPE-JFK", "Taipei (TPE)") — "CAN" in "YOU CAN" is not Guangzhou.
 * @returns {{ kind: string, code: string, text: string, index: number }[]}
 */
export function findPlaces(text) {
  const s = String(text ?? '');
  const hits = [];
  const taken = [];
  const free = (i, len) => !taken.some(([a, b]) => i < b && i + len > a);
  const push = (kind, code, t, index) => {
    if (!free(index, t.length)) return;
    taken.push([index, index + t.length]);
    hits.push({ kind, code, text: t, index });
  };
  for (const m of s.matchAll(ROUTE_PAIR)) {
    const start = m.index + m[0].indexOf(m[1]);
    const second = m.index + m[0].lastIndexOf(m[2]);
    if (knownCode(m[1])) push('place', m[1], m[1], start);
    if (knownCode(m[2])) push('place', m[2], m[2], second);
  }
  for (const m of s.matchAll(PAREN_CODE)) if (knownCode(m[1])) push('place', m[1], m[1], m.index + 1);
  for (const h of scan(PLACES, s)) {
    const code = byAlias.get(h.text);
    if (code) push('place', code, h.text, h.index);
  }
  for (const h of scan(REGIONS, s)) {
    const key = Object.keys(REGION_WORDS).find((k) => fold(k).toLowerCase() === h.text);
    if (key) push('region', REGION_WORDS[key], h.text, h.index);
  }
  for (const h of scan(COUNTRIES, s)) {
    const code = countryByName.get(h.text);
    if (code) push('country', code, h.text, h.index);
  }
  hits.sort((a, b) => a.index - b.index);
  // "Taipei (TPE)" names one place twice, side by side: keep a single hit.
  return hits.filter((h, i) => {
    const prev = hits[i - 1];
    return !(prev && prev.code === h.code && h.index - (prev.index + prev.text.length) <= 3);
  });
}

// ── China / Hong Kong / Macau in free text (zero tolerance, same policy as the fare filter) ──
const CN_LATIN = [
  'hong\\s?kong', 'macau', 'macao', 'mainland china', 'china', 'beijing', 'shanghai', 'guangzhou', 'shenzhen', 'chengdu', 'chongqing', "xi'?an", 'hangzhou',
  'nanjing', 'wuhan', 'kunming', 'xiamen', 'qingdao', 'tianjin', 'dalian', 'harbin', 'changsha', 'zhengzhou', 'urumqi', 'lhasa', 'hainan', 'sanya', 'haikou',
  'guilin', 'ningbo', 'fuzhou', 'shenyang', 'jinan', 'hefei',
];
export const CHINA_PLACE_RE = new RegExp(
  `\\b(?:${CN_LATIN.join('|')})\\b` +
  '|香港|澳門|澳门|中國|中国|大陸|大陆|北京|上海|廣州|广州|深圳|成都|重慶|重庆|西安|杭州|南京|武漢|武汉|昆明|廈門|厦门|青島|青岛|天津|大連|大连|哈爾濱|哈尔滨|海南|三亞|三亚|桂林|寧波|宁波|福州|瀋陽|沈阳|홍콩|마카오|중국|베이징|상하이|광저우|선전',
  'i',
);

// Taiwanese carriers and institutions whose names contain "China" / 中國 but have nothing to do with the mainland.
const ALLOWED_CHINA_WORDS = /china\s+airlines?|mandarin\s+airlines?|中華航空|中华航空|華航|華信|中國信託|中國時報|中國石油/gi;

/** True when the text names a mainland China / Hong Kong / Macau place or one of their airport codes (China Airlines is Taiwanese and fine). */
export function mentionsChinaPlace(text) {
  const s = String(text ?? '').replace(ALLOWED_CHINA_WORDS, ' ');
  if (CHINA_PLACE_RE.test(s)) return true;
  for (const m of s.matchAll(ROUTE_PAIR)) if (BLOCKED_AIRPORTS.has(m[1]) || BLOCKED_AIRPORTS.has(m[2])) return true;
  for (const m of s.matchAll(PAREN_CODE)) if (BLOCKED_AIRPORTS.has(m[1])) return true;
  return false;
}
