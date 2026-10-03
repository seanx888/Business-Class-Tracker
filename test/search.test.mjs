import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSearch, normalizeFilters, routeSegments, includeAirlines, allianceCarriers, isFiltered, itineraryLine, searchKey,
  encodeSearch, decodeSearch, passengerCount,
} from '../web/core/search.js';
import {
  tfsBytes, googleFlightsTfsUrl, googleSearchUrl, kayakSearchUrl, skyscannerSearchUrl, searchLinksFor, marketLinks,
} from '../web/core/links.js';

const S = (over = {}) => normalizeSearch({ o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2027-01-05', ...over }).search;
const MC = {
  trip: 'mc',
  segs: [
    { o: 'CRK', d: 'TPE', date: '2026-11-01' },
    { o: 'TPE', d: 'FCO', date: '2026-11-04' },
    { o: 'FCO', d: 'TPE', date: '2026-11-15' },
  ],
};

test('normalizeSearch: round trip, one way and multi-city', () => {
  const rt = S();
  assert.deepEqual([rt.trip, rt.cabin, rt.maxStops, rt.adults, rt.alliance], ['rt', 'business', null, 1, null]);
  assert.equal(S({ return: null }).trip, 'ow');
  assert.equal(S({ trip: 'ow' }).return, null);
  const mc = normalizeSearch(MC).search;
  assert.equal(mc.trip, 'mc');
  assert.equal(mc.segs.length, 3);
  assert.deepEqual([mc.o, mc.d, mc.depart], ['CRK', 'TPE', '2026-11-01'], 'top level mirrors the first leg');
  assert.deepEqual(routeSegments(mc).map((l) => `${l.o}>${l.d}`), ['CRK>TPE', 'TPE>FCO', 'FCO>TPE']);
  assert.deepEqual(routeSegments(rt).map((l) => `${l.o}>${l.d}@${l.date}`), ['TPE>CDG@2026-12-20', 'CDG>TPE@2027-01-05']);
  assert.equal(itineraryLine(mc), 'CRK→TPE→FCO→TPE');
});

test('normalizeSearch: errors are specific and China/HK/Macau is refused everywhere', () => {
  const err = (raw) => normalizeSearch(raw).error;
  assert.equal(err({ o: 'TPE', d: 'HKG', depart: '2026-12-20' }), 'blocked-airport');
  assert.equal(err({ ...MC, segs: [MC.segs[0], { o: 'TPE', d: 'PVG', date: '2026-11-04' }] }), 'blocked-airport', 'a Shanghai leg inside a multi-city trip');
  assert.equal(err({ o: 'TPE', d: 'TPE', depart: '2026-12-20' }), 'same-airport');
  assert.equal(err({ o: 'TPE', d: 'CDG', depart: 'tomorrow' }), 'depart');
  assert.equal(err({ o: 'TPE', d: 'CDG', depart: '2026-12-20', trip: 'rt', return: '2026-12-01' }), 'return-before-depart');
  assert.equal(err({ ...MC, segs: [MC.segs[0]] }), 'segments', 'one leg is not multi-city');
  assert.equal(err({ ...MC, segs: Array(6).fill(MC.segs[1]) }), 'segments', 'at most five legs');
  assert.equal(err({ ...MC, segs: [MC.segs[1], MC.segs[0]] }), 'segment-order', 'legs must go forward in time');
  assert.equal(err({ o: 'TPE', d: 'CDG', depart: '2026-12-20', airlines: ['CX'] }), 'blocked-airline');
  assert.equal(err({ o: 'TPE', d: 'CDG', depart: '2026-12-20', airlines: 'BR, MU' }), 'blocked-airline');
});

test('normalizeFilters: clamps, never throws', () => {
  const f = (raw) => normalizeFilters(raw).filters;
  assert.equal(f({ cabin: 'suite' }).cabin, 'business');
  assert.equal(f({ maxStops: 5 }).maxStops, null);
  assert.equal(f({ maxStops: 0 }).maxStops, 0);
  assert.equal(f({ alliance: 'STAR' }).alliance, 'STAR');
  assert.equal(f({ alliance: 'nope' }).alliance, null);
  assert.deepEqual(f({ airlines: ' ke, br ,ke, zzz9 ' }).airlines, ['KE', 'BR']);
  assert.equal(f({ airlines: Array.from({ length: 20 }, (_, i) => `A${i % 10}`) }).airlines.length <= 8, true);
  assert.deepEqual([f({ adults: 0 }).adults, f({ adults: 99 }).adults], [1, 9]);
  assert.equal(f({ adults: 8, children: 5 }).children, 1, 'nine travellers at most');
  assert.equal(f({ adults: 1, infantsLap: 3 }).infantsLap, 1, 'one lap infant per adult');
  assert.equal(f({ bags: 7 }).bags, 2);
  assert.equal(f({ maxHours: 0 }).maxHours, null);
  assert.equal(f({ maxHours: 99 }).maxHours, 48);
  assert.equal(passengerCount(f({ adults: 2, children: 1, infantsLap: 1 })), 4);
});

test('alliances expand to member carriers (never a blocked one) and merge with chosen airlines', () => {
  const sky = allianceCarriers('SKYTEAM');
  assert.ok(['CI', 'KE', 'VN', 'AF', 'KL', 'DL'].every((c) => sky.includes(c)));
  assert.ok(!sky.some((c) => ['MU', 'CZ'].includes(c)), 'China Eastern / Southern are SkyTeam in real life — excluded here');
  assert.ok(allianceCarriers('STAR').includes('BR') && !allianceCarriers('STAR').includes('CA'));
  assert.ok(allianceCarriers('ONEWORLD').includes('JL'));
  const mix = includeAirlines({ alliance: 'SKYTEAM', airlines: ['BR'] });
  assert.ok(mix.includes('BR') && mix.includes('CI'));
  assert.deepEqual(includeAirlines({}), []);
});

test('isFiltered: anything beyond route + cabin keeps a search out of the shared route history', () => {
  assert.equal(isFiltered(S()), false);
  assert.equal(isFiltered(S({ cabin: 'first' })), false);
  assert.equal(isFiltered(S({ maxStops: 0 })), true);
  assert.equal(isFiltered(S({ alliance: 'SKYTEAM' })), true);
  assert.equal(isFiltered(S({ adults: 2 })), true);
  assert.equal(isFiltered(normalizeSearch(MC).search), true);
});

test('encodeSearch / decodeSearch round-trip, and a damaged link is an error, not a crash', () => {
  for (const s of [S(), S({ trip: 'ow', alliance: 'SKYTEAM', airlines: ['BR'], adults: 2, children: 1, cabin: 'first', maxStops: 1, bags: 1, maxHours: 20 }), normalizeSearch(MC).search]) {
    const back = decodeSearch(encodeSearch(s));
    assert.ok(back.search, JSON.stringify(back));
    assert.equal(searchKey(back.search), searchKey(s));
    assert.deepEqual(routeSegments(back.search), routeSegments(s));
  }
  assert.match(encodeSearch(S()), /^[A-Za-z0-9_-]+$/, 'URL-safe');
  assert.equal(decodeSearch('%%%').error, 'bad-link');
  assert.equal(decodeSearch(encodeSearch({ trip: 'ow', o: 'TPE', d: 'HKG', depart: '2026-12-20' })).error, 'blocked-airport');
});

// ── Google Flights "tfs": decode the protobuf we produce and check the structure ──
function readVarint(buf, i) {
  let n = 0;
  let shift = 0;
  for (;;) {
    const b = buf[i++];
    n += (b & 127) * 2 ** shift;
    if (b < 128) return [n, i];
    shift += 7;
  }
}
function decode(buf) {
  const fields = [];
  let i = 0;
  while (i < buf.length) {
    let key;
    [key, i] = readVarint(buf, i);
    const num = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 0) {
      let v;
      [v, i] = readVarint(buf, i);
      fields.push([num, v]);
    } else if (wire === 2) {
      let len;
      [len, i] = readVarint(buf, i);
      fields.push([num, buf.slice(i, i + len)]);
      i += len;
    } else throw new Error(`wire type ${wire}`);
  }
  return fields;
}
const text = (b) => Buffer.from(b).toString('utf8');
const all = (fields, n) => fields.filter(([k]) => k === n).map(([, v]) => v);

test('tfs: round trip, cabin, passengers and filters are encoded as Google expects', () => {
  const s = S({ cabin: 'first', adults: 2, children: 1, maxStops: 1, alliance: 'SKYTEAM', airlines: ['BR'] });
  const info = decode(tfsBytes(s));
  assert.equal(all(info, 9)[0], 4, 'seat: first');
  assert.equal(all(info, 19)[0], 1, 'trip: round trip');
  assert.deepEqual(all(info, 8), [1, 1, 2], 'two adults and a child');
  const legs = all(info, 3).map(decode);
  assert.equal(legs.length, 2);
  const out = legs[0];
  assert.equal(text(all(out, 2)[0]), '2026-12-20');
  assert.equal(all(out, 5)[0], 1, 'max one stop');
  assert.equal(text(decode(all(out, 13)[0]).find(([k]) => k === 2)[1]), 'TPE');
  assert.equal(text(decode(all(out, 14)[0]).find(([k]) => k === 2)[1]), 'CDG');
  const airlines = all(out, 6).map(text);
  assert.ok(airlines.includes('BR') && airlines.includes('CI') && airlines.includes('KE'), airlines.join());
  const back = legs[1];
  assert.equal(text(all(back, 2)[0]), '2027-01-05');
  assert.equal(text(decode(all(back, 13)[0]).find(([k]) => k === 2)[1]), 'CDG', 'the return leg flies the other way');
});

test('tfs: multi-city carries every leg in order; nonstop is an explicit 0', () => {
  const mc = normalizeSearch({ ...MC, maxStops: 0, cabin: 'economy' }).search;
  const info = decode(tfsBytes(mc));
  assert.equal(all(info, 19)[0], 3, 'trip: multi-city');
  assert.equal(all(info, 9)[0], 1, 'seat: economy');
  const legs = all(info, 3).map(decode);
  assert.deepEqual(legs.map((l) => text(all(l, 2)[0])), ['2026-11-01', '2026-11-04', '2026-11-15']);
  assert.deepEqual(legs.map((l) => text(decode(all(l, 13)[0]).find(([k]) => k === 2)[1])), ['CRK', 'TPE', 'FCO']);
  assert.ok(legs.every((l) => all(l, 5)[0] === 0), 'max_stops = 0 is present, not omitted');
});

test('Google link: plain query for simple trips, tfs for multi-city and filtered searches; markets add gl + currency', () => {
  const simple = googleSearchUrl(S({ cabin: 'first' }));
  assert.match(simple, /[?&]q=Flights%20from%20TPE%20to%20CDG/);
  assert.match(simple, /first%20class/);
  assert.match(googleSearchUrl(S({ maxStops: 0 })), /nonstop/);
  const mc = googleSearchUrl(normalizeSearch(MC).search);
  assert.match(mc, /[?&]tfs=/);
  assert.doesNotMatch(mc, /[?&]q=/);
  assert.match(googleSearchUrl(S({ alliance: 'SKYTEAM' })), /[?&]tfs=/);
  const vn = googleFlightsTfsUrl(S(), { currency: 'VND', gl: 'vn', lang: 'en' });
  assert.match(vn, /curr=VND/);
  assert.match(vn, /gl=VN/);
  assert.match(vn, /hl=en/);
  // a whole city is understood by name; several airports otherwise fall back to the first
  assert.match(googleSearchUrl(S({ d: 'TYO' })), /to%20TYO/);
  assert.match(googleSearchUrl(S({ d: 'NRT,KIX' })), /to%20NRT/);
});

test('KAYAK / Skyscanner links carry cabin, passengers and nonstop; multi-city only goes to KAYAK and Google', () => {
  const s = S({ cabin: 'premium', adults: 2, maxStops: 0 });
  assert.equal(kayakSearchUrl(s), 'https://www.kayak.com/flights/TPE-CDG/2026-12-20/2027-01-05/premium/2adults?sort=price_a&fs=stops=0');
  assert.match(skyscannerSearchUrl(s), /^https:\/\/www\.skyscanner\.com\.tw\/transport\/flights\/tpe\/cdg\/261220\/270105\/\?adultsv2=2&cabinclass=premiumeconomy&rtn=1&currency=TWD&preferdirects=true$/);
  const mc = normalizeSearch(MC).search;
  assert.equal(kayakSearchUrl(mc), 'https://www.kayak.com/flights/CRK-TPE/2026-11-01/TPE-FCO/2026-11-04/FCO-TPE/2026-11-15/business?sort=price_a');
  assert.deepEqual(searchLinksFor(mc).map((l) => l.key), ['google', 'kayak']);
  assert.deepEqual(searchLinksFor(S()).map((l) => l.key), ['google', 'kayak', 'skyscanner']);
  assert.deepEqual(searchLinksFor(S({ airlines: ['BR'] })).map((l) => l.key), ['google', 'kayak', 'skyscanner', 'airline']);
  assert.match(kayakSearchUrl(S({ lang: 'ko' }), { lang: 'ko' }), /kayak\.co\.kr/);
});

test('marketLinks: one Google link per country with its own currency', () => {
  const links = marketLinks(S(), [{ country: 'VN', currency: 'VND' }, { country: 'TH', currency: 'THB' }]);
  assert.deepEqual(links.map((l) => l.country), ['VN', 'TH']);
  assert.match(links[0].url, /curr=VND&hl=zh-TW&gl=VN|gl=VN/);
  assert.match(links[1].url, /curr=THB/);
});
