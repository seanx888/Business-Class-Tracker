import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeed, decodeEntities, htmlToText } from '../scripts/lib/rss.mjs';
import {
  classifyDeal, extractRoute, findPrices, detectCabin, detectKinds, mentionsChina, airlinesIn, parsePost, parseRouteLine, routeToSearch, suggestAirports, scopeOf, toTWD,
} from '../web/core/community.js';

const feed = (name) => parseFeed(readFileSync(new URL(`./fixtures/feeds/${name}.xml`, import.meta.url), 'utf8'));
const FX = { rates: { TWD: 1, USD: 0.0315, EUR: 0.0272, GBP: 0.0235, SGD: 0.0405 } };
const TODAY = '2026-10-03';
const deal = (raw, source = {}) => classifyDeal({ id: 'x', url: 'https://example.com/x', published: '2026-10-03T08:00:00Z', summary: '', categories: [], ...raw }, { fx: FX, today: TODAY, source });

// ───────────────────────── RSS / Atom ─────────────────────────
test('rss: RSS 2.0 with CDATA, categories, entities and tracking parameters', () => {
  const f = feed('travel-dealz');
  assert.equal(f.format, 'rss');
  assert.equal(f.title, 'Travel-Dealz.com');
  assert.equal(f.items.length, 8);
  const status = f.items[0];
  assert.equal(status.title, 'Explora Journeys: Status Match from Many Luxury Cruise Lines + MSC');
  assert.equal(status.url, 'https://travel-dealz.com/deal/explora-club-status-match/', 'utm_* parameters are dropped');
  assert.equal(status.published, '2026-10-02T14:52:59.000Z');
  assert.ok(status.categories.includes('Status Match'));
  assert.ok(status.summary.startsWith('Explora Journeys, the luxury cruise brand'));
  assert.ok(!/[<>]/.test(status.summary), 'plain text');
  assert.ok(f.items.some((i) => i.title.includes('Bundle&Go')), '&#038; decoded');
});

test('rss: Atom — Reddit escapes its HTML, PTT links use rel=alternate', () => {
  const r = feed('reddit-awardtravel');
  assert.equal(r.format, 'atom');
  assert.equal(r.items.length, 4);
  assert.match(r.items[0].url, /^https:\/\/www\.reddit\.com\/r\/awardtravel\/comments\//);
  assert.ok(r.items[0].published.startsWith('2026-10'));
  const p = feed('ptt-aviation');
  assert.equal(p.items.length, 4);
  assert.ok(p.items[0].title.includes('泰瑞長榮'));
  assert.match(p.items[0].url, /ptt\.cc\/bbs\/Aviation\/M\./);
  assert.equal(typeof p.items[0].author, 'string', 'Atom author/name');
});

test('rss: broken items are skipped, non-feeds are recognised, entities decode', () => {
  const xml = '<rss><channel><title>T</title><item><title>ok</title><link>https://a.example/1</link></item><item><title></title></item><item><link>https://a.example/3</link></item></channel></rss>';
  assert.deepEqual(parseFeed(xml).items.map((i) => i.title), ['ok']);
  assert.equal(parseFeed('<html><body>Just a moment...</body></html>').format, 'unknown');
  assert.equal(parseFeed('').items.length, 0);
  assert.equal(decodeEntities('Tom &amp; Jerry &#8211; &#x1F334; &euro;5 &unknown;'), 'Tom & Jerry – 🌴 €5 &unknown;');
  assert.equal(htmlToText('<p>A&nbsp;<b>deal</b></p><script>x()</script><p>now</p>'), 'A deal now');
});

// ───────────────────────── prices, cabin, kinds ─────────────────────────
test('findPrices: symbols, codes, Chinese units — a bare $ is NT$ in Chinese text and US$ elsewhere', () => {
  const one = (t) => findPrices(t).map((p) => `${p.amount} ${p.currency}`);
  assert.deepEqual(one('flights for €584 return'), ['584 EUR']);
  assert.deepEqual(one('Business Class Deal: Stockholm to Seoul 1605€ Round Trip'), ['1605 EUR']);
  assert.deepEqual(one('United: Philadelphia – Taipei. $894 (Basic Economy) / $1,104 (Regular)'), ['894 USD', '1104 USD']);
  assert.deepEqual(one('全程只要562美（含行李'), ['562 USD']);
  assert.deepEqual(one('只要 NT$18,000 或 1.8萬元 或 40000元起'), ['18000 TWD', '18000 TWD', '40000 TWD']);
  assert.deepEqual(one('來回 $38000'), ['38000 TWD']);
  assert.deepEqual(one('USD 562.79 and S$899 and £324'), ['562.79 USD', '899 SGD', '324 GBP']);
  assert.deepEqual(one('2027元旦 special'), [], 'New Year is not a price');
  assert.deepEqual(one('only $5 extra'), [], 'implausibly small');
  assert.equal(toTWD(562, 'USD', FX), 17841);
  assert.equal(toTWD(10, 'XXX', FX), null);
});

test('detectCabin / detectKinds', () => {
  assert.equal(detectCabin('Business Class Deal: Madrid to Cancun'), 'business');
  assert.equal(detectCabin('FIRST Class Deal: Dublin to Hong Kong'), 'first');
  assert.equal(detectCabin('Nonstop Premium Economy from San Francisco'), 'premium');
  assert.equal(detectCabin('United: Basic Economy fares'), 'economy');
  assert.equal(detectCabin('台北出發 商務艙 特價'), 'business');
  assert.equal(detectCabin('flights to Rome', ['Economy Class']), 'economy');
  assert.equal(detectCabin('flights to Rome'), null);
  const k = (t) => detectKinds(t);
  assert.ok(k('Possible MISTAKE FARE: Hanoi to Paris').includes('error-fare'));
  assert.ok(k('錯誤票價！台北到洛杉磯').includes('error-fare'));
  assert.ok(k('阿提哈德允許聯運').includes('interline'));
  assert.ok(k('Open-jaw flights from Brussels to Cancun, returning to Madrid').includes('multi-city'));
  assert.ok(k('Free stopover in Istanbul').includes('stopover'));
  assert.ok(k('外站票 曼谷出發').includes('ex-station'));
  assert.ok(k('hidden-city trick').includes('hidden-city'));
  assert.ok(k('Flash sale: 30% off').includes('sale'));
  assert.deepEqual(k('Lunch menu review'), []);
});

// ───────────────────────── route ─────────────────────────
test('extractRoute reads the title styles of the deal sites', () => {
  const r = (t) => { const x = extractRoute(t); return `${x.o ? `${x.o.kind}:${x.o.code}` : '?'} > ${x.d ? `${x.d.kind}:${x.d.code}` : '?'}`; };
  assert.equal(r('Turkish Airlines flights from Riga to South Korea for €584'), 'place:RIX > country:KR');
  assert.equal(r('Kuala Lumpur: €500 Turkish Airlines Flights from 8 European Countries (With 30 Kg Luggage)'), 'region:EU > place:KUL');
  assert.equal(r('Korean Air: San Francisco – Chiang Mai, Thailand. $811. Roundtrip, including all Taxes'), 'place:SFO > place:CNX');
  assert.equal(r('Business Class Deal: Stockholm to Seoul 1605€ Round Trip'), 'place:ARN > place:SEL');
  assert.equal(r('Amazing fares! Cheap full-service flights from many European cities to Taiwan 🍜 from €309'), 'region:EU > country:TW');
  assert.equal(r('Tropical escape: cheap flights from Amsterdam to Manila from €454'), 'place:AMS > place:MNL');
  assert.equal(r('HIGH-SEASON ESCAPE 🌴🏙 Taipei, Cambodia, and a secret paradise-like island in one trip from Brussels for €680'), 'place:BRU > place:TPE');
  assert.equal(r('[情報] 華航 台北到東京 特價'), 'place:TPE > place:TYO');
  assert.equal(r('克拉克飛台北 NT$1999'), 'place:CRK > place:TPE');
});

test('scope: home · apac (ex-station) · inbound · global', () => {
  const s = (t) => scopeOf(extractRoute(t), t);
  assert.equal(s('Taipei to Tokyo from NT$9,000'), 'home');
  assert.equal(s('Cheap flights from Manila to Los Angeles'), 'apac');
  assert.equal(s('Bangkok to Paris business class'), 'apac');
  assert.equal(s('United: Philadelphia – Taipei, Taiwan. $894'), 'inbound');
  assert.equal(s('Business Class Deal: Stockholm to Seoul 1605€'), 'global');
});

// ───────────────────────── China / Hong Kong / Macau ─────────────────────────
test('mentionsChina: carriers, cities, flight numbers — and not China Airlines or look-alikes', () => {
  for (const t of ['Hainan Airlines Business Class from Budapest', 'Cheap Cathay flights', 'CX 489 TPE-HKG', 'Air China deal', '國泰航空 商務艙', 'Shenzhen Airlines from London', 'MU 5004 via PVG', 'Rome to Shanghai']) {
    assert.equal(mentionsChina(t), true, t);
  }
  for (const t of ['China Airlines CI 52 nonstop', '華航 台北-洛杉磯', 'Southwest Airlines sale', 'Mandarin Airlines', 'Kuala Lumpur: €500 Turkish Airlines', 'CAN you believe this fare']) {
    assert.equal(mentionsChina(t), false, t);
  }
  assert.deepEqual(airlinesIn('Turkish Airlines and 長榮 plus 華航, EVA, Delta'), ['TK', 'BR', 'CI', 'DL']);
});

// ───────────────────────── classifyDeal on real posts ─────────────────────────
test('classifyDeal: real Fly4free / Travel-Dealz / Flight Deal posts', () => {
  const byTitle = (name, re) => feed(name).items.find((i) => re.test(i.title));
  const riga = deal(byTitle('fly4free', /Riga/));
  assert.equal(riga.item.route.o.code, 'RIX');
  assert.equal(riga.item.price.currency, 'EUR');
  assert.equal(riga.item.price.twd, Math.round(584 / 0.0272));
  assert.equal(riga.item.scope, 'global');
  assert.deepEqual(riga.item.airlines.slice(0, 1), ['TK']);

  const openJaw = deal(byTitle('fly4free', /open-jaw/));
  assert.ok(openJaw.item.kinds.includes('multi-city'));
  assert.equal(openJaw.item.playbook, 'multi-city');

  const inbound = deal(byTitle('theflightdeal', /Philadelphia/));
  assert.equal(inbound.item.scope, 'inbound');
  assert.equal(inbound.item.cabin, 'economy');
  assert.ok(inbound.item.relevance > deal(byTitle('theflightdeal', /Phoenix/)).item.relevance, 'ending in Taiwan matters more to a Taipei flyer');

  const premium = deal(byTitle('travel-dealz', /Premium Economy/));
  assert.equal(premium.item.cabin, 'premium');
  assert.equal(premium.item.price.rt, false, 'one-way');

  // anything touching China / Hong Kong / Macau is gone, even when the title looks harmless
  assert.equal(deal(byTitle('fly4free', /Hong Kong/)).drop, 'china');
  assert.equal(deal(byTitle('fly4free', /Taiwan/)).drop, 'china', 'a Taiwan fare flown on Air China');
  assert.equal(deal(byTitle('travel-dealz', /Shenzhen/)).drop, 'china');
  assert.equal(deal(byTitle('travel-dealz', /Hainan Airlines Business/)).drop, 'china');
  // not fares at all
  assert.equal(deal(byTitle('fly4free', /Vienna in style/)).drop, 'not-a-deal');
  assert.equal(deal({ title: '[情報] 台灣虎航與酷航訂票系統合作' }).drop, 'not-a-deal', 'news about an airline');
  // too old
  assert.equal(deal({ ...byTitle('fly4free', /Riga/), published: '2026-08-01T00:00:00Z' }).drop, 'stale');
});

test('classifyDeal: error fares and business class rise to the top; a Taiwanese board implies Taiwan', () => {
  const plain = deal({ title: 'Cheap flights from Taipei to Tokyo from NT$9,000' }).item;
  const biz = deal({ title: 'Business Class Deal: Taipei to Paris NT$60,000 Round Trip' }).item;
  const err = deal({ title: 'MISTAKE FARE: Business class Taipei to Paris NT$20,000' }).item;
  assert.ok(plain.relevance < biz.relevance && biz.relevance < err.relevance, `${plain.relevance} < ${biz.relevance} < ${err.relevance}`);
  assert.ok(err.kinds.includes('error-fare'));
  assert.equal(err.playbook, 'error-fare');
  const ptt = deal({ title: '[情報] 長榮 商務艙 特價 NT$38,000' }, { id: 'ptt', region: 'tw' }).item;
  assert.equal(ptt.scope, 'home');
  assert.equal(ptt.cabin, 'business');
  assert.equal(ptt.price.twd, 38000);
  const exStation = deal({ title: 'Business class from Manila to Los Angeles $1,800 round trip' }).item;
  assert.ok(exStation.kinds.includes('ex-station'), 'a deal starting in a nearby city is an ex-station chance');
});

// ───────────────────────── pasted posts (the Facebook post from the screenshots) ─────────────────────────
const POST = `該讓這張票面世了
阿提哈德允許聯運
所以可以從從菲律賓的宿霧以及克拉克
聯運至台北，再從台北出發至歐美各地
當然
菲律賓出發的票總是特別優秀
可以開發出各種玩法

如圖一
克拉克-台北-紐約-普吉島
全程只要562美（含行李
或圖二
克拉克-台北-羅馬-台北
569美（不含行李
或圖三
克拉克-台北-米蘭 冰島-新加坡
579美（不含行李

當然這只是一小部份的舉例
實際運用的可以更廣，更便宜
就看大家的想像力了

舉個例子
菲律賓-台北-歐洲-台北-沖繩
菲律賓-台北-歐洲-紐澳
或是回程段選商務艙
也都可以有不錯的價格，就看各位的能力了XD`;

test('parsePost: Etihad interline post → three priced routes, two ideas, airline, tricks, playbook', () => {
  const r = parsePost(POST, { fx: FX });
  assert.equal(r.ok, true);
  assert.deepEqual(r.airlines, ['EY']);
  assert.equal(r.alliance, 'NONE');
  assert.ok(['interline', 'ex-station', 'multi-city'].every((k) => r.kinds.includes(k)), r.kinds.join());
  assert.equal(r.playbook, 'interline-multicity');
  assert.equal(r.routes.length, 5);
  const [a, b, c, d, e] = r.routes;
  assert.deepEqual(a.nodes.map((n) => n.code), ['CRK', 'TPE', 'NYC', 'HKT']);
  assert.deepEqual(a.legs.map((l) => `${l.o}>${l.d}`), ['CRK>TPE', 'TPE>NYC', 'NYC>HKT']);
  assert.deepEqual([a.price.amount, a.price.currency, a.price.twd, a.bags], [562, 'USD', 17841, true]);
  assert.deepEqual([b.price.amount, b.bags], [569, false]);
  assert.deepEqual(b.legs.map((l) => `${l.o}>${l.d}`), ['CRK>TPE', 'TPE>ROM', 'ROM>TPE']);
  assert.deepEqual([c.price.amount, c.bags], [579, false]);
  assert.deepEqual(c.legs.map((l) => `${l.o}>${l.d}`), ['CRK>TPE', 'TPE>MIL', 'KEF>SIN'], 'Milan → Iceland is a hop you make yourself: no flight in between');
  assert.equal(c.nodes.find((n) => n.code === 'KEF').gap, true);
  assert.equal(d.price, null, 'ideas without a price stay ideas');
  assert.equal(r.price.amount, 562, 'the cheapest priced example');
  assert.equal(r.cabin, null, 'the business-class remark is about the return leg of the ideas, not the fares above');
  assert.equal(r.cabinHint, 'business');
  assert.ok(e.nodes.some((n) => n.kind === 'region' && n.code === 'OCNZ'));
});

test('routeToSearch: concrete routes become a multi-city search; country / region stops ask for an airport', () => {
  const r = parsePost(POST, { fx: FX });
  const s = routeToSearch(r.routes[0]);
  assert.equal(s.trip, 'mc');
  assert.deepEqual(s.segs.map((x) => `${x.o}>${x.d}`), ['CRK>TPE', 'TPE>NYC', 'NYC>HKT']);
  assert.deepEqual(s.wild, []);
  assert.equal(routeToSearch(r.routes[1]).trip, 'mc');
  const rt = routeToSearch(parsePost('台北-東京-台北\n來回 NT$12000').routes[0]);
  assert.equal(rt.trip, 'rt');
  assert.equal(routeToSearch(parsePost('台北-東京').routes[0]).trip, 'ow');
  const idea = routeToSearch(r.routes[3]);
  assert.deepEqual(idea.wild.map((w) => `${w.kind}:${w.code}`), ['country:PH', 'region:EU']);
  assert.deepEqual(idea.wild[0].suggestions.slice(0, 3), ['MNL', 'CRK', 'CEB']);
  assert.ok(idea.wild[1].suggestions.includes('FCO'));
  assert.deepEqual(idea.bind, [[0, 1], [1, 2], [2, 3], [3, 4]], 'one stop shared by the legs on both sides');
  assert.deepEqual(suggestAirports('place', 'TPE'), []);
});

test('parsePost: English posts, junk and China', () => {
  const en = parsePost('Business Class Deal: Stockholm to Seoul 1605€ Round Trip\nnonstop on Finnair');
  assert.equal(en.routes[0].nodes.length, 2);
  assert.equal(en.price.currency, 'EUR');
  assert.equal(parsePost('hello world').error, 'unreadable', 'no route, no price');
  assert.equal(parsePost('  ').error, 'empty');
  assert.equal(parsePost('台北-香港-巴黎 特價 商務艙').error, 'china');
  assert.equal(parsePost('國泰航空 商務艙 NT$30,000').error, 'china');
  assert.equal(parseRouteLine('今天天氣很好'), null);
  assert.equal(parseRouteLine('如圖一'), null);
  assert.equal(parseRouteLine('全程只要562美（含行李'), null);
});
