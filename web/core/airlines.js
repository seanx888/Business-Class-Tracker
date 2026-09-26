// Airline reference data shared by the scanner (Node) and the PWA (browser).
// Alliance membership changes over time — last reviewed 2026-09.
//   • ITA Airways (AZ) left SkyTeam (2025-04) and joined Star Alliance 2026-04-01.
//   • Asiana (OZ) leaves Star Alliance 2026-12-16 and merges into Korean Air (SkyTeam).
//   • SAS (SK) moved to SkyTeam 2024-09-01.

export const ALLIANCES = {
  SKYTEAM: { key: 'SKYTEAM', name: 'SkyTeam', rank: 0 },
  STAR: { key: 'STAR', name: 'Star Alliance', rank: 1 },
  ONEWORLD: { key: 'ONEWORLD', name: 'oneworld', rank: 2 },
  NONE: { key: 'NONE', name: 'Non-alliance', rank: 3 },
};

// Display order: SkyTeam is always listed / ranked first.
export const ALLIANCE_ORDER = ['SKYTEAM', 'STAR', 'ONEWORLD', 'NONE'];

// code: [English name, 中文名, alliance, home country, website]
const A = (en, zh, alliance, country, url = '') => ({ en, zh, alliance, country, url });

export const AIRLINES = {
  // ── SkyTeam ─────────────────────────────────────────────
  CI: A('China Airlines', '中華航空', 'SKYTEAM', 'TW', 'https://www.china-airlines.com'),
  KE: A('Korean Air', '大韓航空', 'SKYTEAM', 'KR', 'https://www.koreanair.com'),
  VN: A('Vietnam Airlines', '越南航空', 'SKYTEAM', 'VN', 'https://www.vietnamairlines.com'),
  GA: A('Garuda Indonesia', '印尼航空', 'SKYTEAM', 'ID', 'https://www.garuda-indonesia.com'),
  AF: A('Air France', '法國航空', 'SKYTEAM', 'FR', 'https://www.airfrance.com'),
  KL: A('KLM', '荷蘭皇家航空', 'SKYTEAM', 'NL', 'https://www.klm.com'),
  DL: A('Delta Air Lines', '達美航空', 'SKYTEAM', 'US', 'https://www.delta.com'),
  VS: A('Virgin Atlantic', '維珍航空', 'SKYTEAM', 'GB', 'https://www.virginatlantic.com'),
  SK: A('SAS', '北歐航空', 'SKYTEAM', 'SE', 'https://www.flysas.com'),
  SV: A('Saudia', '沙烏地阿拉伯航空', 'SKYTEAM', 'SA', 'https://www.saudia.com'),
  AM: A('Aeroméxico', '墨西哥國際航空', 'SKYTEAM', 'MX', 'https://aeromexico.com'),
  UX: A('Air Europa', '西班牙歐羅巴航空', 'SKYTEAM', 'ES', 'https://www.aireuropa.com'),
  AR: A('Aerolíneas Argentinas', '阿根廷航空', 'SKYTEAM', 'AR', 'https://www.aerolineas.com.ar'),
  KQ: A('Kenya Airways', '肯亞航空', 'SKYTEAM', 'KE', 'https://www.kenya-airways.com'),
  ME: A('Middle East Airlines', '中東航空', 'SKYTEAM', 'LB', 'https://www.mea.com.lb'),
  RO: A('TAROM', '羅馬尼亞航空', 'SKYTEAM', 'RO', 'https://www.tarom.ro'),
  AE: A('Mandarin Airlines', '華信航空', 'NONE', 'TW', 'https://www.mandarin-airlines.com'),

  // ── Star Alliance ───────────────────────────────────────
  BR: A('EVA Air', '長榮航空', 'STAR', 'TW', 'https://www.evaair.com'),
  NH: A('ANA', '全日空', 'STAR', 'JP', 'https://www.ana.co.jp'),
  OZ: A('Asiana Airlines', '韓亞航空', 'STAR', 'KR', 'https://flyasiana.com'),
  SQ: A('Singapore Airlines', '新加坡航空', 'STAR', 'SG', 'https://www.singaporeair.com'),
  TG: A('Thai Airways', '泰國航空', 'STAR', 'TH', 'https://www.thaiairways.com'),
  UA: A('United Airlines', '聯合航空', 'STAR', 'US', 'https://www.united.com'),
  LH: A('Lufthansa', '德國漢莎航空', 'STAR', 'DE', 'https://www.lufthansa.com'),
  LX: A('SWISS', '瑞士國際航空', 'STAR', 'CH', 'https://www.swiss.com'),
  OS: A('Austrian Airlines', '奧地利航空', 'STAR', 'AT', 'https://www.austrian.com'),
  SN: A('Brussels Airlines', '布魯塞爾航空', 'STAR', 'BE', 'https://www.brusselsairlines.com'),
  TK: A('Turkish Airlines', '土耳其航空', 'STAR', 'TR', 'https://www.turkishairlines.com'),
  AC: A('Air Canada', '加拿大航空', 'STAR', 'CA', 'https://www.aircanada.com'),
  NZ: A('Air New Zealand', '紐西蘭航空', 'STAR', 'NZ', 'https://www.airnewzealand.com'),
  AI: A('Air India', '印度航空', 'STAR', 'IN', 'https://www.airindia.com'),
  ET: A('Ethiopian Airlines', '衣索比亞航空', 'STAR', 'ET', 'https://www.ethiopianairlines.com'),
  MS: A('EgyptAir', '埃及航空', 'STAR', 'EG', 'https://www.egyptair.com'),
  LO: A('LOT Polish Airlines', '波蘭航空', 'STAR', 'PL', 'https://www.lot.com'),
  TP: A('TAP Air Portugal', '葡萄牙航空', 'STAR', 'PT', 'https://www.flytap.com'),
  A3: A('Aegean Airlines', '愛琴海航空', 'STAR', 'GR', 'https://en.aegeanair.com'),
  OU: A('Croatia Airlines', '克羅埃西亞航空', 'STAR', 'HR', 'https://www.croatiaairlines.com'),
  AV: A('Avianca', '哥倫比亞航空', 'STAR', 'CO', 'https://www.avianca.com'),
  CM: A('Copa Airlines', '巴拿馬航空', 'STAR', 'PA', 'https://www.copaair.com'),
  SA: A('South African Airways', '南非航空', 'STAR', 'ZA', 'https://www.flysaa.com'),
  AZ: A('ITA Airways', '義大利 ITA 航空', 'STAR', 'IT', 'https://www.ita-airways.com'),

  // ── oneworld ────────────────────────────────────────────
  JL: A('Japan Airlines', '日本航空', 'ONEWORLD', 'JP', 'https://www.jal.co.jp'),
  QR: A('Qatar Airways', '卡達航空', 'ONEWORLD', 'QA', 'https://www.qatarairways.com'),
  MH: A('Malaysia Airlines', '馬來西亞航空', 'ONEWORLD', 'MY', 'https://www.malaysiaairlines.com'),
  QF: A('Qantas', '澳洲航空', 'ONEWORLD', 'AU', 'https://www.qantas.com'),
  BA: A('British Airways', '英國航空', 'ONEWORLD', 'GB', 'https://www.britishairways.com'),
  AA: A('American Airlines', '美國航空', 'ONEWORLD', 'US', 'https://www.aa.com'),
  AS: A('Alaska Airlines', '阿拉斯加航空', 'ONEWORLD', 'US', 'https://www.alaskaair.com'),
  AY: A('Finnair', '芬蘭航空', 'ONEWORLD', 'FI', 'https://www.finnair.com'),
  IB: A('Iberia', '西班牙國家航空', 'ONEWORLD', 'ES', 'https://www.iberia.com'),
  UL: A('SriLankan Airlines', '斯里蘭卡航空', 'ONEWORLD', 'LK', 'https://www.srilankan.com'),
  RJ: A('Royal Jordanian', '約旦皇家航空', 'ONEWORLD', 'JO', 'https://www.rj.com'),
  AT: A('Royal Air Maroc', '摩洛哥皇家航空', 'ONEWORLD', 'MA', 'https://www.royalairmaroc.com'),
  FJ: A('Fiji Airways', '斐濟航空', 'ONEWORLD', 'FJ', 'https://www.fijiairways.com'),
  WY: A('Oman Air', '阿曼航空', 'ONEWORLD', 'OM', 'https://www.omanair.com'),

  // ── Non-alliance (incl. budget flat-beds) ──────────────
  JX: A('STARLUX Airlines', '星宇航空', 'NONE', 'TW', 'https://www.starlux-airlines.com'),
  B7: A('UNI Air', '立榮航空', 'NONE', 'TW', 'https://www.uniair.com.tw'),
  IT: A('Tigerair Taiwan', '台灣虎航', 'NONE', 'TW', 'https://www.tigerairtw.com'),
  EK: A('Emirates', '阿聯酋航空', 'NONE', 'AE', 'https://www.emirates.com'),
  EY: A('Etihad Airways', '阿提哈德航空', 'NONE', 'AE', 'https://www.etihad.com'),
  PR: A('Philippine Airlines', '菲律賓航空', 'NONE', 'PH', 'https://www.philippineairlines.com'),
  VJ: A('Vietjet (SkyBoss Business)', '越捷航空', 'NONE', 'VN', 'https://www.vietjetair.com'),
  QH: A('Bamboo Airways', '越竹航空', 'NONE', 'VN', 'https://www.bambooairways.com'),
  PG: A('Bangkok Airways', '曼谷航空', 'NONE', 'TH', 'https://www.bangkokair.com'),
  TW: A("T'way Air", '德威航空', 'NONE', 'KR', 'https://www.twayair.com'),
  ZG: A('ZIPAIR', 'ZIPAIR', 'NONE', 'JP', 'https://www.zipair.net'),
  D7: A('AirAsia X', '全亞洲航空 X', 'NONE', 'MY', 'https://www.airasia.com'),
  TR: A('Scoot', '酷航', 'NONE', 'SG', 'https://www.flyscoot.com'),
  JQ: A('Jetstar', '捷星航空', 'NONE', 'AU', 'https://www.jetstar.com'),
  VA: A('Virgin Australia', '維珍澳洲航空', 'NONE', 'AU', 'https://www.virginaustralia.com'),
  BI: A('Royal Brunei', '汶萊皇家航空', 'NONE', 'BN', 'https://www.flyroyalbrunei.com'),
  GF: A('Gulf Air', '海灣航空', 'NONE', 'BH', 'https://www.gulfair.com'),
  FZ: A('flydubai', '杜拜航空', 'NONE', 'AE', 'https://www.flydubai.com'),
  KC: A('Air Astana', '阿斯塔納航空', 'NONE', 'KZ', 'https://airastana.com'),
  HY: A('Uzbekistan Airways', '烏茲別克航空', 'NONE', 'UZ', 'https://www.uzairways.com'),
  '6E': A('IndiGo', '靛藍航空', 'NONE', 'IN', 'https://www.goindigo.in'),
  LY: A('El Al', '以色列航空', 'NONE', 'IL', 'https://www.elal.com'),
  WS: A('WestJet', '西捷航空', 'NONE', 'CA', 'https://www.westjet.com'),
  B6: A('JetBlue', '捷藍航空', 'NONE', 'US', 'https://www.jetblue.com'),
  HA: A('Hawaiian Airlines', '夏威夷航空', 'NONE', 'US', 'https://www.hawaiianairlines.com'),
  '7C': A('Jeju Air', '濟州航空', 'NONE', 'KR', 'https://www.jejuair.net'),
  YP: A('Air Premia', '南韓 Air Premia', 'NONE', 'KR', 'https://www.airpremia.com'),
};

// "Business" on low-cost carriers: flat seat, but lounge / meals / miles are often extra or absent.
export const BUDGET_PREMIUM = new Set(['ZG', 'D7', 'VJ', 'TW', 'TR', 'JQ', '6E', 'YP']);

// ── Carriers based in mainland China, Hong Kong or Macau — ALWAYS excluded ──
// Marketing OR operating carrier match => itinerary rejected.
export const BLOCKED_CARRIERS = {
  // Mainland China
  CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern', HU: 'Hainan Airlines',
  MF: 'Xiamen Airlines', '3U': 'Sichuan Airlines', ZH: 'Shenzhen Airlines',
  SC: 'Shandong Airlines', FM: 'Shanghai Airlines', HO: 'Juneyao Air', '9C': 'Spring Airlines',
  KN: 'China United Airlines', GS: 'Tianjin Airlines', JD: 'Beijing Capital Airlines',
  PN: 'West Air', '8L': 'Lucky Air', G5: 'China Express', EU: 'Chengdu Airlines',
  BK: 'Okay Airways', TV: 'Tibet Airlines', NS: 'Hebei Airlines', KY: 'Kunming Airlines',
  DZ: 'Donghai Airlines', GJ: 'Loong Air', A6: 'Hongtu Airlines', QW: 'Qingdao Airlines',
  DR: 'Ruili Airlines', Y8: 'Suparna Airlines', GX: 'GX Airlines', '9H': "Chang'an Airlines",
  JR: 'Joy Air', UQ: 'Urumqi Air', RY: 'Jiangxi Air', GT: 'Air Guilin',
  GY: 'Colorful Guizhou Airlines', OQ: 'Chongqing Airlines', FU: 'Fuzhou Airlines',
  '9D': 'Genghis Khan Airlines', LT: 'LongJiang Airlines', AQ: '9 Air', CN: 'Grand China Air',
  CK: 'China Cargo Airlines', O3: 'SF Airlines',
  // Hong Kong
  CX: 'Cathay Pacific', KA: 'Cathay Dragon', UO: 'HK Express', HX: 'Hong Kong Airlines',
  HB: 'Greater Bay Airlines', LD: 'Air Hong Kong',
  // Macau
  NX: 'Air Macau',
};

// Name fragments used when a provider only gives a carrier *name*
// (e.g. Google Flights "plane_and_crew_by"). Lower-case.
const BLOCKED_NAME_PATTERNS = [
  'air china', 'china eastern', 'china southern', 'hainan airlines', 'xiamen air',
  'sichuan airlines', 'shenzhen airlines', 'shandong airlines', 'shanghai airlines',
  'juneyao', 'spring airlines', 'china united', 'tianjin airlines', 'capital airlines',
  'west air', 'lucky air', 'china express', 'chengdu airlines', 'okay airways',
  'tibet airlines', 'hebei airlines', 'kunming airlines', 'donghai airlines', 'loong air',
  'hongtu', 'qingdao airlines', 'ruili airlines', 'suparna', 'gx airlines', 'beibu gulf',
  "chang'an airlines", 'joy air', 'urumqi air', 'jiangxi air', 'air guilin',
  'colorful guizhou', 'chongqing airlines', 'fuzhou airlines', 'genghis khan',
  'longjiang', 'grand china', 'china cargo', 'sf airlines',
  'cathay', 'hk express', 'hong kong airlines', 'greater bay', 'air hong kong', 'air macau',
];

// China Airlines (中華航空, CI) is a TAIWANESE carrier — explicitly allowed.
const ALLOWED_NAME_PATTERNS = ['china airlines', '中華航空', 'mandarin airlines'];

export function isBlockedCarrierCode(code) {
  return !!code && Object.prototype.hasOwnProperty.call(BLOCKED_CARRIERS, String(code).toUpperCase());
}

export function isBlockedCarrierName(name) {
  if (!name) return false;
  const n = String(name).toLowerCase().trim();
  if (ALLOWED_NAME_PATTERNS.some((p) => n.startsWith(p))) return false;
  if (BLOCKED_NAME_PATTERNS.some((p) => n.includes(p))) return true;
  // Catch-all for unfamiliar "China …" brands (never matches "China Airlines", handled above).
  if (/\bchina\b/.test(n) || /(香港|澳門|中國國際|東方航空|南方航空)/.test(name)) return true;
  return false;
}

export function airlineInfo(code) {
  return AIRLINES[code] || null;
}

export function allianceOf(code) {
  return AIRLINES[code]?.alliance || 'NONE';
}

export function airlineName(code, lang = 'en') {
  const a = AIRLINES[code];
  if (!a) return BLOCKED_CARRIERS[code] || code;
  return lang.startsWith('zh') ? a.zh : a.en;
}
