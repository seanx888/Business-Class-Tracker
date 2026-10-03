// Frequent-flyer programs for the member wallet (會員卡夾). Tier names are suggestions only —
// the field stays free text because programs rename tiers often. Last reviewed 2026-09.
// Programs of carriers the app excludes (China / Hong Kong / Macau) are not preset; "Other" covers anything.
import { allianceOf } from './airlines.js';

// key: [carrier, English name, 中文, 한국어, tiers]
const P = (carrier, en, zh, ko, tiers = []) => ({ kind: 'airline', carrier, en, zh, ko, tiers });
// Non-airline programs (hotels, car rental): no carrier, so they never earn on a flight.
const H = (kind, en, zh, ko, tiers = []) => ({ kind, carrier: null, en, zh, ko, tiers });

export const PROGRAMS = {
  // SkyTeam
  CI: P('CI', 'Dynasty Flyer', '華夏會員', '다이너스티 플라이어', ['Dynasty Flyer', 'Gold', 'Emerald', 'Paragon']),
  KE: P('KE', 'SKYPASS', 'SKYPASS 會員', '스카이패스', ['Morning Calm', 'Morning Calm Premium', 'Million Miler']),
  AFKL: P('AF', 'Flying Blue', 'Flying Blue 藍天飛行', '플라잉 블루', ['Explorer', 'Silver', 'Gold', 'Platinum', 'Ultimate']),
  DL: P('DL', 'SkyMiles', 'SkyMiles 飛凡里程', '스카이마일스', ['Silver Medallion', 'Gold Medallion', 'Platinum Medallion', 'Diamond Medallion']),
  VN: P('VN', 'Lotusmiles', '金蓮花里程', '로터스마일', ['Titanium', 'Silver', 'Gold', 'Platinum']),
  GA: P('GA', 'GarudaMiles', 'GarudaMiles', '가루다마일스', ['Blue', 'Silver', 'Gold', 'Platinum']),
  VS: P('VS', 'Flying Club', 'Flying Club', '플라잉 클럽', ['Red', 'Silver', 'Gold']),
  SK: P('SK', 'EuroBonus', 'EuroBonus', '유로보너스', ['Member', 'Silver', 'Gold', 'Diamond']),
  // Star Alliance
  BR: P('BR', 'Infinity MileageLands', '無限萬哩遊', '인피니티 마일리지랜드', ['Green', 'Silver', 'Gold', 'Diamond']),
  NH: P('NH', 'ANA Mileage Club', 'ANA 哩程俱樂部', 'ANA 마일리지 클럽', ['Bronze', 'Platinum', 'Diamond']),
  SQ: P('SQ', 'KrisFlyer', 'KrisFlyer 新航會員', '크리스플라이어', ['KrisFlyer', 'Elite Silver', 'Elite Gold', 'PPS Club', 'Solitaire PPS Club']),
  TG: P('TG', 'Royal Orchid Plus', '皇家蘭花會員', '로열 오키드 플러스', ['Member', 'Silver', 'Gold', 'Platinum']),
  OZ: P('OZ', 'Asiana Club', '韓亞俱樂部', '아시아나클럽', ['Silver', 'Gold', 'Diamond', 'Diamond Plus', 'Platinum']),
  UA: P('UA', 'MileagePlus', 'MileagePlus 前程萬里', '마일리지플러스', ['Premier Silver', 'Premier Gold', 'Premier Platinum', 'Premier 1K']),
  LH: P('LH', 'Miles & More', 'Miles & More', '마일스 앤 모어', ['Member', 'Frequent Traveller', 'Senator', 'HON Circle']),
  TK: P('TK', 'Miles&Smiles', 'Miles&Smiles', '마일스앤스마일스', ['Classic', 'Classic Plus', 'Elite', 'Elite Plus']),
  AC: P('AC', 'Aeroplan', 'Aeroplan', '에어로플랜', ['25K', '35K', '50K', '75K', 'Super Elite']),
  // oneworld
  JL: P('JL', 'JAL Mileage Bank', 'JAL 哩程銀行', 'JAL 마일리지 뱅크', ['Crystal', 'Sapphire', 'JGC Premier', 'Diamond']),
  AA: P('AA', 'AAdvantage', 'AAdvantage', '어드밴티지', ['Gold', 'Platinum', 'Platinum Pro', 'Executive Platinum']),
  BA: P('BA', 'Executive Club', 'Executive Club', '이그제큐티브 클럽', ['Blue', 'Bronze', 'Silver', 'Gold']),
  QR: P('QR', 'Privilege Club', 'Privilege Club', '프리빌리지 클럽', ['Burgundy', 'Silver', 'Gold', 'Platinum']),
  QF: P('QF', 'Qantas Frequent Flyer', '澳航飛行常客', '콴타스 상용고객', ['Bronze', 'Silver', 'Gold', 'Platinum', 'Platinum One']),
  AS: P('AS', 'Atmos Rewards', 'Atmos Rewards', '아트모스 리워즈', ['Silver', 'Gold', 'Platinum', 'Titanium']),
  MH: P('MH', 'Enrich', 'Enrich', '인리치', ['Blue', 'Silver', 'Gold', 'Platinum']),
  // Non-alliance
  JX: P('JX', 'COSMILE', '星宇 COSMILE', 'COSMILE'),
  EK: P('EK', 'Emirates Skywards', '阿聯酋 Skywards', '스카이워드', ['Blue', 'Silver', 'Gold', 'Platinum']),
  EY: P('EY', 'Etihad Guest', 'Etihad Guest', '에티하드 게스트', ['Bronze', 'Silver', 'Gold', 'Platinum']),
  PR: P('PR', 'Mabuhay Miles', 'Mabuhay Miles', '마부하이 마일스'),
  // Hotels and car rental (no carrier): status matches and promotions cross these industries, so the wallet holds them too.
  MARRIOTT: H('hotel', 'Marriott Bonvoy', '萬豪旅享家 (Marriott Bonvoy)', '메리어트 본보이', ['Member', 'Silver Elite', 'Gold Elite', 'Platinum Elite', 'Titanium Elite', 'Ambassador Elite']),
  HILTON: H('hotel', 'Hilton Honors', '希爾頓榮譽客會', '힐튼 아너스', ['Member', 'Silver', 'Gold', 'Diamond']),
  HYATT: H('hotel', 'World of Hyatt', '凱悅天地 (World of Hyatt)', '월드 오브 하얏트', ['Member', 'Discoverist', 'Explorist', 'Globalist']),
  IHG: H('hotel', 'IHG One Rewards', 'IHG 優悅會', 'IHG 원 리워즈', ['Club', 'Silver Elite', 'Gold Elite', 'Platinum Elite', 'Diamond Elite']),
  ACCOR: H('hotel', 'ALL – Accor Live Limitless', '雅高 ALL', '아코르 ALL', ['Classic', 'Silver', 'Gold', 'Platinum', 'Diamond']),
  WYNDHAM: H('hotel', 'Wyndham Rewards', '溫德姆獎賞', '윈덤 리워즈', ['Blue', 'Gold', 'Platinum', 'Diamond']),
  RADISSON: H('hotel', 'Radisson Rewards', '麗笙獎賞', '래디슨 리워즈', ['Club', 'Premium', 'VIP']),
  SHANGRILA: H('hotel', 'Shangri-La Circle', '香格里拉榮譽貴賓會', '샹그릴라 서클', ['Jade', 'Gold', 'Diamond']),
  HERTZ: H('car', 'Hertz Gold Plus Rewards', 'Hertz Gold Plus Rewards', '허츠 골드 플러스 리워즈', ['Gold', 'Five Star', "President's Circle"]),
  AVIS: H('car', 'Avis Preferred', 'Avis Preferred', '에이비스 프리퍼드', ['Preferred', 'Preferred Plus', 'President’s Club']),
};

export const OTHER_PROGRAM = 'OTHER';

export function programName(key, lang = 'en', custom = '') {
  if (key === OTHER_PROGRAM || !PROGRAMS[key]) return custom || key;
  const p = PROGRAMS[key];
  return lang.startsWith('zh') ? p.zh : lang.startsWith('ko') ? p.ko : p.en;
}

export const programCarrier = (key) => PROGRAMS[key]?.carrier || null;
export const programAlliance = (key) => (PROGRAMS[key]?.carrier ? allianceOf(PROGRAMS[key].carrier) : 'NONE');
/** 'airline' | 'hotel' | 'car' — OTHER and unknown keys count as airline-agnostic 'other'. */
export const programKind = (key) => PROGRAMS[key]?.kind || 'other';

/**
 * Which of your memberships earn on this flight: same airline first, then same alliance.
 * @returns {{ m, why: 'same' | 'alliance' }[]}
 */
export function earningMemberships(members, carrier, alliance) {
  const out = [];
  for (const m of members || []) {
    const c = programCarrier(m.program);
    if (!c) continue;
    const sameCarrier = c === carrier || (m.program === 'AFKL' && (carrier === 'AF' || carrier === 'KL'));
    if (sameCarrier) out.push({ m, why: 'same' });
    else if (alliance && alliance !== 'NONE' && programAlliance(m.program) === alliance) out.push({ m, why: 'alliance' });
  }
  return out.sort((a, b) => (a.why === b.why ? 0 : a.why === 'same' ? -1 : 1));
}
