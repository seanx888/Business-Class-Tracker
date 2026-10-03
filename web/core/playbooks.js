// 玩法庫 — how the "special" ways of buying a ticket work: the logic, the buying steps, what it really costs, what can go wrong.
// Written for a Taipei flyer. Content is general know-how plus the examples people post; airline rules change, so every
// playbook says what to double-check. Nothing here is searched or promoted by the app unless it says so.
//
//   playbook(id) · playbooksFor(kinds) · pick(text, lang) · playCost({…}) → what the whole trip costs vs the direct fare
import { shiftDate } from './search.js';

const T = (zh, en, ko) => ({ 'zh-TW': zh, en, ko });

/** Text in the viewer's language (falls back to English). */
export const pick = (v, lang = 'zh-TW') => (v && typeof v === 'object' ? v[lang] ?? v[lang.startsWith('zh') ? 'zh-TW' : lang.startsWith('ko') ? 'ko' : 'en'] ?? v.en : v ?? '');

export const COST_FIELDS = ['ticket', 'positioning', 'baggage', 'seat', 'lodging', 'visa', 'other'];

export const PLAYBOOKS = [
  {
    id: 'interline-multicity',
    icon: 'airplane-tilt',
    risk: 'medium',
    effort: 3,
    featured: true,
    kinds: ['interline', 'multi-city', 'ex-station'],
    cost: { fields: ['ticket', 'positioning', 'baggage', 'seat', 'lodging', 'visa'], defaults: { positioning: 3500 } },
    title: T('菲律賓出發的聯運多段票（阿提哈德範例）', 'Multi-city interline ticket from the Philippines (Etihad example)', '필리핀 출발 연계 다구간 항공권 (에티하드 사례)'),
    tagline: T(
      '把整張票的起點放在票價便宜的菲律賓（克拉克／宿霧），第一段聯運到台北，再從台北飛歐美 — 一張票，台北在中間。',
      'Start the whole ticket in the Philippines, where fares are cheap (Clark / Cebu), interline the first hop to Taipei, then fly on to Europe or America from Taipei — one ticket with Taipei in the middle.',
      '티켓 전체의 출발지를 운임이 싼 필리핀(클라크/세부)으로 잡고, 첫 구간을 타이베이까지 연계한 뒤 타이베이에서 유럽·미주로 — 타이베이가 중간에 낀 한 장의 티켓.',
    ),
    logic: [
      T('航空公司的價格看「從哪裡起算、在哪個國家賣」。同樣的長程航段，從票價市場便宜的城市（這裡是菲律賓）起算，整張多段票的總價可以比從台北直接買更低。',
        'Airlines price by where the ticket starts and in which country it is sold. The same long-haul flights can cost less in total when the ticket starts in a cheap market (here: the Philippines) than when it starts in Taipei.',
        '항공사는 티켓이 어디서 시작하고 어느 나라에서 파는지에 따라 가격을 매깁니다. 같은 장거리 구간도 운임이 싼 시장(여기서는 필리핀)에서 시작하면 타이베이에서 사는 것보다 총액이 낮을 수 있습니다.'),
      T('阿提哈德允許「聯運」（interline）：別家航空的航班可以開在同一張票上。所以第一段「克拉克／宿霧 → 台北」是別家飛的，之後台北 →（阿布達比）→ 歐美才是阿提哈德自己的長程段。',
        'Etihad allows interlining: flights of other airlines can sit on the same ticket. So the first hop Clark / Cebu → Taipei is flown by another airline, and Taipei → (Abu Dhabi) → Europe / America is Etihad’s own long-haul part.',
        '에티하드는 연계(interline) 발권을 허용해 다른 항공사 항공편을 같은 티켓에 넣을 수 있습니다. 그래서 첫 구간 클라크/세부 → 타이베이는 타 항공사, 이후 타이베이 →(아부다비)→ 유럽·미주가 에티하드의 장거리 구간입니다.'),
      T('對住在台北的人，第一段是「定位航段」：你得先自己（另外買一張便宜機票）飛到菲律賓，再搭票上的第一段飛回台北。真正的成本＝多段票價＋去菲律賓的機票＋行李等雜費。總成本比直接買台北出發便宜才划算。',
        'For someone living in Taipei the first leg is a positioning leg: you fly to the Philippines yourself (a cheap separate ticket) and then take the ticket’s first flight back to Taipei. The real cost is the multi-city fare + the flight to the Philippines + baggage and extras — worth it only when that total beats a direct ticket from Taipei.',
        '타이베이에 사는 사람에게 첫 구간은 포지셔닝 구간입니다. 먼저 (따로 산 저렴한 티켓으로) 필리핀에 가고, 티켓의 첫 비행기로 타이베이에 돌아옵니다. 실제 비용 = 다구간 운임 + 필리핀 왕복 항공권 + 수하물 등 부대비용이며, 이 합계가 타이베이 직접 발권보다 싸야 이득입니다.'),
      T('多段票可以做成「開口」：回程不用回菲律賓，可回台北、再接沖繩等（貼文範例：克拉克–台北–羅馬–台北；克拉克–台北–米蘭／冰島–新加坡；或回程段改商務艙）。',
        'The multi-city ticket can be open-jaw: the return need not go back to the Philippines — back to Taipei, then on to Okinawa and so on (post examples: Clark–Taipei–Rome–Taipei; Clark–Taipei–Milan / Iceland–Singapore; or business class on the return leg only).',
        '다구간 티켓은 오픈조로 만들 수 있습니다. 귀국편이 필리핀으로 돌아갈 필요 없이 타이베이로, 이어서 오키나와 등으로 (게시글 예: 클라크–타이베이–로마–타이베이, 클라크–타이베이–밀라노/아이슬란드–싱가포르, 귀국 구간만 비즈니스).'),
    ],
    steps: [
      T('到阿提哈德官網，把國家／語言切到「菲律賓」，幣別選 USD 或 PHP，搜尋選「多城市」（Multi-city）。', 'On etihad.com switch the country / language to Philippines, pick USD or PHP, and choose Multi-city.', '에티하드 홈페이지에서 국가/언어를 필리핀으로 바꾸고 통화는 USD 또는 PHP, 검색은 다구간(Multi-city)을 고릅니다.'),
      T('第 1 段：克拉克（CRK）或宿霧（CEB）→ 台北（TPE）；第 2 段：台北 → 目的地；第 3 段：回台北，或接下一個城市。每一段各自選日期（可試前後幾天，多段票的價格對日期很敏感）。',
        'Leg 1: Clark (CRK) or Cebu (CEB) → Taipei (TPE); leg 2: Taipei → destination; leg 3: back to Taipei or on to the next city. Pick a date per leg — try a few days either side, multi-city fares are date-sensitive.',
        '1구간: 클라크(CRK) 또는 세부(CEB) → 타이베이(TPE), 2구간: 타이베이 → 목적지, 3구간: 타이베이로 복귀 또는 다음 도시. 구간마다 날짜를 고르고 앞뒤 며칠도 비교하세요(다구간 운임은 날짜에 민감).'),
      T('看清楚票價類型。截圖範例是「經濟 Basic」：通常不含託運行李、選位要加價、不能改票退票。貼文範例一含行李（USD 562），範例二、三不含（USD 569／579）。',
        'Check the fare type. The screenshots show Economy Basic: usually no checked bag, paid seat selection, no changes or refunds. Example 1 includes a bag (US$562), examples 2 and 3 do not (US$569 / 579).',
        '운임 종류를 확인하세요. 캡처는 이코노미 Basic으로, 보통 위탁 수하물 없음·좌석 지정 유료·변경/환불 불가입니다. 예시 1은 수하물 포함(US$562), 예시 2·3은 미포함(US$569/579).'),
      T('先確定你能「在菲律賓出發」：另外買一張便宜的台北 → 克拉克／宿霧單程，抵達時間要比第一段早很多（建議前一天），並確認入境規定。',
        'Make sure you can actually start in the Philippines: buy a cheap one-way Taipei → Clark / Cebu separately, arriving well before leg 1 (the day before is safest), and check entry rules.',
        '필리핀에서 실제로 출발할 수 있는지 확인하세요. 타이베이 → 클라크/세부 편도를 따로 싸게 사고, 첫 구간보다 훨씬 일찍(전날 권장) 도착하며 입국 규정도 확인합니다.'),
      T('結帳前把總價算清楚：多段票價 ＋ 行李 ＋ 選位 ＋ 去菲律賓的機票 ＋ 信用卡海外手續費（約 1.5%），再和台北出發的最低價比（下方「成本試算」）。',
        'Before paying, add it all up: multi-city fare + bags + seats + the flight to the Philippines + card foreign-transaction fee (about 1.5%), and compare with the best fare from Taipei (cost calculator below).',
        '결제 전에 합계를 계산하세요. 다구간 운임 + 수하물 + 좌석 + 필리핀행 항공권 + 카드 해외결제 수수료(약 1.5%)를 타이베이 출발 최저가와 비교합니다(아래 비용 계산기).'),
      T('用外幣刷卡。價格會因結帳國家而異，先用本 App 的「比價其他國家」或手動切換國家確認哪裡最便宜。',
        'Pay with a foreign-currency-friendly card. Prices differ by country of sale — use the app’s “compare countries” or switch the country by hand to see where it is cheapest.',
        '해외결제에 유리한 카드로 결제하세요. 판매 국가에 따라 가격이 다르므로 앱의 "다른 나라 비교"나 국가 수동 전환으로 가장 싼 곳을 확인합니다.'),
      T('開票後逐段確認電子機票號碼與行李規定；聯運段的行李以「實際載運的航空公司」規定為準。',
        'After ticketing, check the e-ticket numbers and baggage rules leg by leg; on interlined legs the operating airline’s baggage rules apply.',
        '발권 후 구간별 전자항공권 번호와 수하물 규정을 확인하세요. 연계 구간은 실제 운항 항공사의 수하물 규정이 적용됩니다.'),
    ],
    risks: [
      T('第一段沒搭（No-show）可能讓其餘航段被取消 — 這個玩法的第一段就是「從菲律賓飛到台北」，務必真的搭。', 'Skipping the first flight (no-show) can cancel the rest of the ticket — here the first flight is Philippines → Taipei, so you must actually take it.', '첫 구간 노쇼는 나머지 구간 취소로 이어질 수 있습니다. 이 방식의 첫 구간은 필리핀 → 타이베이이므로 반드시 탑승해야 합니다.'),
      T('Basic 票價不能改退，延誤或錯過接駁不一定補償；轉機時間（範例中阿布達比停留 15–20 小時以上）要自己確認是否需要過境簽證與住宿。', 'Basic fares cannot be changed or refunded and a missed connection may not be covered; long layovers (15–20 h+ in Abu Dhabi in the examples) may need a transit visa and a hotel.', 'Basic 운임은 변경·환불이 안 되고 연결편을 놓쳐도 보상이 없을 수 있습니다. 긴 환승(예시의 아부다비 15~20시간 이상)은 환승 비자와 숙박이 필요할 수 있습니다.'),
      T('價格是貼文截圖當天的，不保證仍可購買；航空公司隨時可調整聯運與票價規則。這是社群分享的做法，並非本 App 驗證過的方案。', 'Prices are from the post’s screenshots, not a promise they can still be bought; airlines can change interline and fare rules at any time. This is a community technique, not something the app has verified.', '가격은 게시글 캡처 시점 기준이며 지금도 구매 가능하다는 보장이 없습니다. 항공사는 언제든 연계·운임 규칙을 바꿀 수 있고, 이는 커뮤니티 기법일 뿐 앱이 검증한 것이 아닙니다.'),
      T('Google Flights 通常看不到這類票；真正的價格要在航空公司官網（用菲律賓市場）查。本 App 的搜尋可當作比較基準。', 'Google Flights usually does not show these fares; the real price is on the airline site in the Philippine market. The app’s search is a useful yardstick.', '구글 항공편에는 이런 운임이 잘 보이지 않습니다. 실제 가격은 항공사 사이트(필리핀 시장)에서 확인하고, 앱 검색은 비교 기준으로 쓰세요.'),
    ],
    tools: [
      { label: T('阿提哈德官網', 'Etihad website', '에티하드 홈페이지'), url: 'https://www.etihad.com' },
    ],
    // What the screenshots showed (Etihad site, zh-TW, Economy Basic). Dates are 2026.
    example: {
      airline: 'EY',
      note: T('以下是貼文截圖當天的畫面，不是即時票價。', 'These are the screenshots’ prices on the day, not live fares.', '게시글 캡처 당시 가격이며 실시간 운임이 아닙니다.'),
      items: [
        { id: 'fig1', price: 562.79, currency: 'USD', bags: true, cabin: 'economy',
          legs: [{ o: 'CRK', d: 'TPE', date: '2026-10-04' }, { o: 'TPE', d: 'JFK', date: '2026-10-09' }, { o: 'JFK', d: 'HKT', date: '2026-10-27' }] },
        { id: 'fig2', price: 569.8, currency: 'USD', bags: false, cabin: 'economy',
          legs: [{ o: 'CRK', d: 'TPE', date: '2026-11-01' }, { o: 'TPE', d: 'FCO', date: '2026-11-04' }, { o: 'FCO', d: 'TPE', date: '2026-11-15' }] },
        { id: 'fig3', price: 579.1, currency: 'USD', bags: false, cabin: 'economy',
          legs: [{ o: 'CRK', d: 'TPE', date: '2026-11-01' }, { o: 'TPE', d: 'MXP', date: '2026-11-07' }, { o: 'KEF', d: 'SIN', date: '2026-11-24' }] },
      ],
    },
  },
  {
    id: 'ex-station',
    icon: 'map-pin',
    risk: 'low',
    effort: 2,
    kinds: ['ex-station'],
    cost: { fields: ['ticket', 'positioning', 'baggage', 'lodging', 'visa'], defaults: {} },
    title: T('外站票（從更便宜的城市起算）', 'Ex-station ticket (start where it is cheaper)', '외항발 항공권 (더 싼 도시에서 출발)'),
    tagline: T('同一條長程航線，從曼谷、馬尼拉、首爾、東京等「外站」起算常比台北便宜；先飛到外站再開始這張票。', 'The same long-haul route often costs less from Bangkok, Manila, Seoul or Tokyo than from Taipei: fly to the ex-station first, then start the ticket there.', '같은 장거리 노선도 방콕·마닐라·서울·도쿄 같은 외항에서 출발하면 타이베이보다 싼 경우가 많습니다. 먼저 외항으로 이동한 뒤 그곳에서 티켓을 시작합니다.'),
    logic: [
      T('票價依「出發國的市場」訂價，旅行需求與競爭不同，同樣的商務艙在不同城市差很多。', 'Fares follow the market of the departure country; demand and competition differ, so the same business-class seat can cost very different amounts by city.', '운임은 출발 국가 시장에 따라 정해지고 수요·경쟁이 달라 같은 비즈니스석도 도시마다 가격 차이가 큽니다.'),
      T('老手常見做法：買「外站 → 台北 → 目的地 → 台北 →（外站）」。你先自己飛到外站，搭票上的第一段回台北，再繼續長程；最後一段回外站可以不搭（最後一段不搭通常沒事，第一段不搭會讓後面全部作廢）。',
        'The classic: buy “ex-station → Taipei → destination → Taipei → (ex-station)”. Fly to the ex-station yourself, take the ticket’s first flight back to Taipei and carry on; skipping the final coupon is usually fine, skipping the first voids the rest.',
        '고전적 방법: "외항 → 타이베이 → 목적지 → 타이베이 → (외항)" 발권. 외항까지 직접 가서 티켓 첫 구간으로 타이베이에 돌아온 뒤 장거리를 이어갑니다. 마지막 구간 미탑승은 보통 문제없지만 첫 구간을 타지 않으면 나머지가 모두 무효입니다.'),
      T('這張票的總成本＝外站票價＋定位機票＋雜費。App 的「外站出發」已用你設定的定位成本幫你比好。', 'Total cost = ex-station fare + positioning flight + extras. The app’s “Ex-station” view already compares using the positioning costs you set.', '총비용 = 외항 운임 + 포지셔닝 항공권 + 부대비용. 앱의 "외항 출발" 화면은 설정한 포지셔닝 비용으로 이미 비교해 줍니다.'),
    ],
    steps: [
      T('在「特殊票價 → 外站出發」找出票價低於台北的外站，或在搜尋頁直接查外站。', 'Find ex-stations cheaper than Taipei under Special fares → Ex-station, or search an ex-station directly in the search page.', '"특수 운임 → 외항 출발"에서 타이베이보다 싼 외항을 찾거나 검색 화면에서 외항을 직접 검색합니다.'),
      T('另外買一張台北 → 外站的便宜機票（最好前一天抵達，避免延誤讓整張票作廢）。', 'Buy a cheap Taipei → ex-station ticket separately (arrive the day before so a delay cannot void the whole ticket).', '타이베이 → 외항 저가 항공권을 따로 사세요(지연으로 전체 티켓이 무효가 되지 않도록 전날 도착 권장).'),
      T('用外站出發的日期開票，並確認第一段會經過台北、可以停留。', 'Ticket it for the ex-station departure date and make sure the first leg passes through Taipei and allows the stop.', '외항 출발 날짜로 발권하고 첫 구간이 타이베이를 경유하며 체류가 가능한지 확인하세요.'),
      T('算出總成本，與台北直接出發比較；也可到「外國站結帳」確認買票的最佳國家。', 'Work out the total and compare with starting in Taipei; also check the best country to pay in under Foreign-site checkout.', '총비용을 계산해 타이베이 직접 출발과 비교하고, "해외 사이트 결제"에서 가장 좋은 결제 국가도 확인하세요.'),
    ],
    risks: [
      T('第一段一定要搭；停留規則、票期與改票費依票價規則。', 'Always fly the first coupon; stopover rules, validity and change fees follow the fare rules.', '첫 구간은 반드시 탑승해야 하며 체류 규정·유효기간·변경 수수료는 운임 규정을 따릅니다.'),
      T('定位航班要留延誤緩衝；分開購買的機票之間航空公司不負責轉乘。', 'Leave a buffer for the positioning flight; airlines are not responsible for connections between separately bought tickets.', '포지셔닝 항공편은 지연 여유를 두세요. 따로 산 티켓 사이의 연결은 항공사가 책임지지 않습니다.'),
    ],
    tools: [],
  },
  {
    id: 'multi-city',
    icon: 'arrows-left-right',
    risk: 'low',
    effort: 2,
    kinds: ['multi-city'],
    cost: { fields: ['ticket', 'baggage', 'lodging', 'other'], defaults: {} },
    title: T('多段票／開口票（進出不同城市）', 'Multi-city / open-jaw (fly into one city, out of another)', '다구간 / 오픈조 (들어가는 도시와 나오는 도시가 다름)'),
    tagline: T('去程和回程不在同一個城市、或一次串好幾個城市，省掉回頭路，有時還比來回票便宜。', 'Different cities in and out, or several cities on one ticket: no backtracking, and sometimes cheaper than a round trip.', '들어가는 도시와 나오는 도시를 다르게 하거나 여러 도시를 한 티켓에 묶어 되돌아가는 수고를 줄이고, 때로는 왕복보다 쌉니다.'),
    logic: [
      T('開口票（open-jaw）：例如 台北 → 巴黎、羅馬 → 台北，中間自己搭火車。多段票（multi-city）：最多 5 段，各段日期自訂。', 'Open-jaw: e.g. Taipei → Paris, Rome → Taipei, with a train in between. Multi-city: up to five legs, each with its own date.', '오픈조: 예) 타이베이 → 파리, 로마 → 타이베이, 사이는 기차. 다구간: 최대 5구간, 구간마다 날짜 지정.'),
      T('航空公司對「來回」「兩張單程」「多段」各有不同定價，三種都查一次才知道哪個最便宜。', 'Airlines price round trips, pairs of one-ways and multi-city differently — check all three to see which wins.', '항공사는 왕복·편도 두 장·다구간을 다르게 책정하므로 세 가지를 모두 비교해야 합니다.'),
    ],
    steps: [
      T('在「航線追蹤 → 搜尋」選「多段」，依序加入每一段（下一段的出發地會自動帶入上一段的目的地，可手動改成開口）。', 'In Routes → Search choose Multi-city and add the legs in order (each new leg starts where the last ended — change it for an open-jaw).', '"노선 추적 → 검색"에서 다구간을 고르고 구간을 순서대로 추가하세요(다음 구간 출발지는 이전 도착지로 자동 입력되며, 오픈조는 직접 바꿉니다).'),
      T('同時查「來回」與「兩張單程」比較；有想追蹤的組合就按「設定追蹤」。', 'Compare with the plain round trip and two one-ways; use “Track” on the combination you like.', '일반 왕복·편도 두 장과 비교하고, 마음에 드는 조합은 "추적 설정"을 누르세요.'),
      T('開票前確認各段行李、改票規則與兩城市之間的陸路交通時間。', 'Before ticketing check baggage and change rules per leg and the overland time between the two cities.', '발권 전에 구간별 수하물·변경 규정과 두 도시 간 육로 이동 시간을 확인하세요.'),
    ],
    risks: [
      T('某一段沒搭，後面的航段可能被取消；各段順序不能亂。', 'Missing one leg can cancel the later ones; the order of legs cannot be changed.', '한 구간을 타지 않으면 이후 구간이 취소될 수 있고 구간 순서는 바꿀 수 없습니다.'),
    ],
    tools: [],
  },
  {
    id: 'stopover',
    icon: 'clock',
    risk: 'low',
    effort: 1,
    kinds: ['stopover'],
    cost: { fields: ['ticket', 'lodging', 'visa', 'other'], defaults: {} },
    title: T('停留點（把轉機變成多玩一個城市）', 'Stopovers (turn a connection into an extra city)', '스톱오버 (환승을 도시 하나 더 여행으로)'),
    tagline: T('在轉機城市停留一到數天再繼續飛，常常不用多付機票錢。', 'Stay a day or several in the connecting city before flying on — often at no extra air fare.', '환승 도시에 하루 또는 며칠 머문 뒤 이어서 비행. 항공권 추가 비용이 없는 경우가 많습니다.'),
    logic: [
      T('有些航空公司把停留當成行銷：例如冰島航空（冰島）、土耳其航空（伊斯坦堡）、阿聯酋／卡達／阿提哈德（杜拜／杜哈／阿布達比）、葡萄牙航空（里斯本／波多）。條款常變，請以官網為準。', 'Some airlines market stopovers: Icelandair (Iceland), Turkish Airlines (Istanbul), Emirates / Qatar / Etihad (Dubai / Doha / Abu Dhabi), TAP (Lisbon / Porto). Terms change often — check the airline’s page.', '일부 항공사는 스톱오버를 상품으로 내놓습니다. 아이슬란드항공(아이슬란드), 터키항공(이스탄불), 에미레이트/카타르/에티하드(두바이/도하/아부다비), TAP(리스본/포르투). 조건이 자주 바뀌니 공식 페이지에서 확인하세요.'),
      T('沒有官方方案也能自己做：用多段票把轉機城市放在中間一段，各段日期拉開。', 'Without an official programme you can build one: put the connecting city in the middle of a multi-city ticket and space the dates.', '공식 상품이 없어도 다구간 티켓에서 환승 도시를 중간 구간으로 넣고 날짜를 벌려 직접 만들 수 있습니다.'),
    ],
    steps: [
      T('在搜尋頁選「多段」：台北 → 轉機城市（日期 A）、轉機城市 → 目的地（日期 A＋停留天數）、目的地 → 台北。', 'In Search pick Multi-city: Taipei → hub (date A), hub → destination (date A + nights), destination → Taipei.', '검색 화면에서 다구간 선택: 타이베이 → 환승 도시(날짜 A), 환승 도시 → 목적지(A + 숙박일), 목적지 → 타이베이.'),
      T('與「不停留」的價格相比；多出的通常只是住宿與當地花費。', 'Compare with the no-stopover price; the extra is usually just lodging and local spending.', '스톱오버 없는 가격과 비교하세요. 추가 비용은 대개 숙박과 현지 지출뿐입니다.'),
      T('確認過境／入境簽證與行李是否要提領。', 'Check transit / entry visa rules and whether you must collect your bags.', '환승/입국 비자 규정과 수하물 수령 여부를 확인하세요.'),
    ],
    risks: [T('停留超過規定天數可能要加價；簽證與住宿費要算進總成本。', 'Staying beyond the allowed days can cost extra; visas and lodging belong in the total.', '허용 일수를 넘기면 추가 요금이 붙을 수 있고, 비자와 숙박비도 총비용에 넣어야 합니다.')],
    tools: [],
  },
  {
    id: 'error-fare',
    icon: 'lightning',
    risk: 'medium',
    effort: 1,
    kinds: ['error-fare'],
    cost: { fields: ['ticket', 'baggage', 'other'], defaults: {} },
    title: T('錯誤票價（Mistake / Bug fare）', 'Error fares (mistake / bug fares)', '오류 운임 (미스테이크 / 버그 페어)'),
    tagline: T('航空公司或訂票網站偶爾標錯價（幣別、稅金、打字），特價網站發現後通常幾小時內就消失。', 'Airlines and booking sites occasionally publish a wrong price (currency, taxes, a typo); deal sites spot it and it is usually gone within hours.', '항공사나 예약 사이트가 가끔 가격을 잘못 올립니다(통화·세금·오타). 특가 사이트가 발견하면 보통 몇 시간 안에 사라집니다.'),
    logic: [
      T('有的航空公司會承認並讓你搭，有的會取消並退款 — 沒有人能保證。所以原則是：快速開票、先別花不能退的錢。', 'Some airlines honour them, others cancel and refund — nobody can promise either. So: ticket fast, and do not spend money you cannot get back yet.', '인정하고 탑승시켜 주는 항공사도, 취소하고 환불하는 항공사도 있어 누구도 보장할 수 없습니다. 그래서 빨리 발권하되 돌려받을 수 없는 돈은 아직 쓰지 마세요.'),
    ],
    steps: [
      T('先在官網確認該價格在「你的市場」還在；姓名與護照完全一致。', 'Confirm the price is still there in your market on the official site; names exactly as on the passport.', '공식 사이트에서 내 시장에 그 가격이 아직 있는지 확인하고, 이름은 여권과 정확히 일치시키세요.'),
      T('用信用卡立刻付款，存下訂位確認與畫面截圖。', 'Pay at once by credit card and save the confirmation and screenshots.', '신용카드로 즉시 결제하고 예약 확인서와 화면 캡처를 저장하세요.'),
      T('等到航空公司寄出電子機票（有票號）再訂飯店、其他交通；老手的經驗是先別主動聯絡航空公司（這是經驗談，不是規定）。', 'Wait until the e-ticket (with ticket number) arrives before booking hotels or other transport; hunters’ folk wisdom is to avoid contacting the airline first (folk advice, not a rule).', '전자항공권(티켓 번호)이 올 때까지 호텔·다른 교통편 예약은 미루세요. 먼저 항공사에 연락하지 않는 것이 경험칙이지만 규칙은 아닙니다.'),
      T('若被取消：要求全額退款或補差價，必要時向發卡銀行爭議。', 'If it is cancelled: ask for a full refund or the difference, and dispute with your card issuer if needed.', '취소되면 전액 환불 또는 차액 보상을 요구하고, 필요하면 카드사에 이의를 제기하세요.'),
    ],
    risks: [T('被取消的可能性始終存在；稅金或燃油附加費可能事後補收。', 'Cancellation is always possible; taxes or fuel surcharges may be added later.', '취소 가능성은 항상 있으며 세금·유류할증료가 나중에 추가될 수 있습니다.')],
    tools: [],
  },
  {
    id: 'foreign-pos',
    icon: 'globe-hemisphere-east',
    risk: 'low',
    effort: 1,
    kinds: [],
    cost: { fields: ['ticket', 'other'], defaults: {} },
    title: T('外國站結帳（在別的國家付款）', 'Pay in another country (foreign point of sale)', '해외 사이트 결제 (다른 나라에서 결제)'),
    tagline: T('同一張票，在別的國家網站、用當地貨幣結帳，價格可能不同。', 'The same ticket can cost a different amount on another country’s site, in its currency.', '같은 티켓도 다른 나라 사이트에서 현지 통화로 결제하면 가격이 달라질 수 있습니다.'),
    logic: [
      T('航空公司依「銷售國」訂價與匯率；匯差、當地促銷、稅制都會影響最後價格。', 'Airlines price per country of sale; exchange rates, local promotions and taxes all shape the final price.', '항공사는 판매 국가별로 가격과 환율을 적용하며 환율·현지 프로모션·세금이 최종 가격에 영향을 줍니다.'),
    ],
    steps: [
      T('搜尋結果的卡片按「比價其他國家」（或在「特殊票價 → 外國站結帳」）看各國價格。', 'Press “Compare countries” on a result (or open Special fares → Foreign-site checkout) to see each country’s price.', '검색 결과 카드의 "다른 나라 비교"(또는 "특수 운임 → 해외 사이트 결제")로 나라별 가격을 보세요.'),
      T('到航空公司官網最下方切換國家／語言，幣別改成當地貨幣再搜尋同一組航班。', 'Switch country / language in the airline site’s footer and search the same flights in that currency.', '항공사 사이트 하단에서 국가/언어를 바꾸고 해당 통화로 같은 항공편을 검색하세요.'),
      T('換算成台幣再扣掉信用卡海外手續費（約 1.5%）後比較。', 'Convert to TWD and subtract the card’s foreign-transaction fee (about 1.5%) before comparing.', '대만 달러로 환산하고 카드 해외결제 수수료(약 1.5%)를 반영해 비교하세요.'),
    ],
    risks: [
      T('部分票價只限當地居民，或需要該國發行的信用卡；改票、退票與客服依銷售國規定。', 'Some fares are residents-only or need a locally issued card; changes, refunds and support follow the country of sale.', '일부 운임은 현지 거주자 전용이거나 현지 발급 카드가 필요하며, 변경·환불·고객 지원은 판매 국가 규정을 따릅니다.'),
    ],
    tools: [],
  },
  {
    id: 'hidden-city',
    icon: 'warning',
    risk: 'high',
    effort: 2,
    kinds: ['hidden-city'],
    cost: { fields: ['ticket', 'other'], defaults: {} },
    title: T('甩尾票（Hidden-city）— 高風險，僅供了解', 'Hidden-city ticketing — high risk, for awareness only', '히든시티 발권 — 고위험, 이해를 위한 설명'),
    tagline: T('買 A→C（途經 B）比 A→B 便宜，在 B 下機、不搭 B→C。航空公司明文禁止。', 'Buy A→C via B because it is cheaper than A→B, then leave at B and skip B→C. Airlines expressly forbid it.', 'A→B보다 싼 A→C(B 경유)를 사서 B에서 내리고 B→C는 타지 않는 방식. 항공사가 명시적으로 금지합니다.'),
    logic: [
      T('社群貼文常提到這招，所以這裡寫清楚風險。本 App 不會搜尋、也不推薦這類票。', 'Community posts mention this trick often, so the risks are spelled out here. The app does not search for or recommend such tickets.', '커뮤니티 글에 자주 나오는 방법이라 위험을 분명히 적습니다. 앱은 이런 티켓을 검색하거나 추천하지 않습니다.'),
    ],
    steps: [
      T('不建議。若仍要了解：只能單程、只帶隨身行李（託運行李會被送到最終目的地）、不能與回程同票、行程變更時風險更高。', 'Not recommended. For awareness only: one-way only, carry-on only (checked bags go to the final destination), never on a ticket with a return, and riskier when schedules change.', '권장하지 않습니다. 참고로: 편도만, 기내 수하물만(위탁 수하물은 최종 목적지로 감), 귀국편이 있는 티켓에는 불가, 일정 변경 시 위험이 더 큼.'),
    ],
    risks: [
      T('違反運送條款：航空公司可取消剩餘航段與回程、追討票價差額、凍結或關閉會員帳號與里程。', 'It breaks the conditions of carriage: the airline can cancel remaining and return flights, bill the fare difference, and freeze or close your loyalty account and miles.', '운송약관 위반입니다. 항공사가 남은 구간과 귀국편을 취소하고 운임 차액을 청구하며 회원 계정과 마일리지를 동결·폐쇄할 수 있습니다.'),
      T('班機異動或改搭時，你可能被改到沒有 B 的行程，整張票作廢。', 'If the flights change you may be rebooked on something that skips B, and the ticket is lost.', '운항 변경 시 B를 거치지 않는 일정으로 재배정되어 티켓이 무효가 될 수 있습니다.'),
    ],
    tools: [],
  },
];

const byId = new Map(PLAYBOOKS.map((p) => [p.id, p]));
export const playbook = (id) => byId.get(id) || null;

/** Playbooks that explain any of these kinds (a deal's tags), most specific first. */
export function playbooksFor(kinds = []) {
  return PLAYBOOKS.filter((p) => p.kinds.some((k) => kinds.includes(k)));
}

/**
 * What a trick really costs, in TWD.
 *   ticket: { amount, currency }  ·  extras: { positioning, baggage, seat, lodging, visa, other } in TWD  ·  fx: { rates } (TWD base)
 *   feePct: card foreign-transaction fee (default 1.5)  ·  baselineTWD: the direct fare to compare with
 */
export function playCost({ ticket, extras = {}, fx = null, feePct = 1.5, baselineTWD = null }) {
  const cur = ticket?.currency || 'TWD';
  const rate = cur === 'TWD' ? 1 : fx?.rates?.[cur];
  const ticketTWD = ticket && Number.isFinite(ticket.amount) && rate ? Math.round(ticket.amount / rate) : null;
  const fee = ticketTWD != null && cur !== 'TWD' ? Math.round((ticketTWD * feePct) / 100) : 0;
  const extra = COST_FIELDS.filter((k) => k !== 'ticket').reduce((n, k) => n + (Number(extras[k]) || 0), 0);
  const total = ticketTWD == null ? null : ticketTWD + fee + extra;
  const saving = total != null && Number.isFinite(baselineTWD) && baselineTWD > 0 ? baselineTWD - total : null;
  return {
    ticketTWD,
    fee,
    extra,
    total,
    saving,
    savingPct: saving != null ? Math.round((saving / baselineTWD) * 1000) / 10 : null,
  };
}

/**
 * An example trip carries the dates of the post's screenshots, which are in the past by the time someone reads them.
 * Move every date forward in whole weeks (so weekdays are kept) until the first flight is at least `lead` days away.
 */
export function exampleLegs(item, today, lead = 21) {
  const first = item.legs[0].date;
  const min = shiftDate(today, lead);
  const weeks = first >= min ? 0 : Math.ceil((Date.parse(`${min}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / (7 * 86400000));
  return item.legs.map((l) => ({ o: l.o, d: l.d, date: shiftDate(l.date, 7 * weeks) }));
}
