import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaces, findPlaces, placeLabel, placeString, mentionsChinaPlace, countryOf, resolvePlaces, CITY_GROUPS } from '../web/core/places.js';

test('parsePlaces: city codes expand, blocked airports and junk are refused', () => {
  assert.deepEqual(parsePlaces('tyo, hnd'), { codes: ['NRT', 'HND'] });
  assert.deepEqual(parsePlaces('NYC'), { codes: ['JFK', 'EWR', 'LGA'] });
  assert.deepEqual(parsePlaces(['tpe']), { codes: ['TPE'] });
  assert.deepEqual(parsePlaces('nrt hnd nrt'), { codes: ['NRT', 'HND'] }, 'duplicates collapse');
  assert.equal(parsePlaces('TPE HKG').error, 'blocked-airport');
  assert.equal(parsePlaces('BJS').error, 'blocked-airport', 'Beijing city code');
  assert.equal(parsePlaces('PVG').error, 'blocked-airport');
  assert.equal(parsePlaces('abcd').error, 'airport');
  assert.equal(parsePlaces('').error, 'airport');
  assert.equal(parsePlaces('LON NYC').error, 'too-many', 'more than four airports');
  assert.equal(placeString(['NRT', 'HND']), 'NRT,HND');
});

test('placeLabel: whole cities read as the city, others as airports, in three languages', () => {
  assert.equal(placeLabel('NRT,HND', 'zh-TW'), '東京');
  assert.equal(placeLabel('JFK,EWR,LGA', 'en'), 'New York');
  assert.equal(placeLabel('SEL', 'ko'), '서울', 'a city code reads as the city');
  assert.equal(placeLabel('ICN,GMP', 'ko'), '서울');
  assert.equal(placeLabel('TPE', 'zh-TW'), '台北桃園');
  assert.equal(placeLabel('CRK', 'zh-TW'), '克拉克');
  assert.equal(placeLabel('ZZZ', 'en'), 'ZZZ', 'unknown codes stay as they are');
  assert.ok(Object.values(CITY_GROUPS).every((list) => list.length >= 2));
  assert.equal(countryOf('CRK'), 'PH');
  assert.equal(countryOf('NYC'), 'US');
});

const route = (text) => findPlaces(text).filter((h) => h.kind === 'place').map((h) => h.code);

test('findPlaces: the Facebook post from the screenshots reads as a route', () => {
  assert.deepEqual(route('克拉克-台北-紐約-普吉島'), ['CRK', 'TPE', 'NYC', 'HKT']);
  assert.deepEqual(route('克拉克-台北-羅馬-台北'), ['CRK', 'TPE', 'ROM', 'TPE']);
  assert.deepEqual(route('克拉克-台北-米蘭 冰島-新加坡'), ['CRK', 'TPE', 'MIL', 'KEF', 'SIN']);
  const regions = findPlaces('菲律賓-台北-歐洲-紐澳');
  assert.deepEqual(regions.map((h) => `${h.kind}:${h.code}`), ['country:PH', 'place:TPE', 'region:EU', 'region:OCNZ']);
});

test('findPlaces: English deal titles, accents and Korean', () => {
  assert.deepEqual(route('Business Class Deal: Stockholm to Seoul 1605€ Round Trip'), ['ARN', 'SEL']);
  assert.deepEqual(route('Turkish Airlines flights from Riga to South Korea for €584'), ['RIX']);
  assert.deepEqual(findPlaces('flights from Riga to South Korea').filter((h) => h.kind === 'country').map((h) => h.code), ['KR']);
  assert.deepEqual(route('Málaga, Cancún and Kraków'), ['AGP', 'CUN', 'KRK']);
  assert.deepEqual(route('서울-도쿄-오사카'), ['SEL', 'TYO', 'OSA']);
  assert.deepEqual(route('Taipei (TPE) to New York'), ['TPE', 'NYC']);
});

test('findPlaces: a bare three-letter word is not an airport unless it sits in a route', () => {
  assert.deepEqual(route('YOU CAN FLY CHEAP'), []);
  assert.deepEqual(route('TPE-JFK fare'), ['TPE', 'JFK']);
  assert.deepEqual(route('CRK to TPE'), ['CRK', 'TPE']);
  assert.deepEqual(route('Who is the best, THE SIN of airlines'), [], 'SIN without a route is just a word');
});

test('mentionsChinaPlace: mainland China, Hong Kong and Macau are caught; Taiwan and look-alikes are not', () => {
  for (const t of ['Bangkok: €442 Hainan Airlines Flights', 'Rome to Shanghai 1435€', 'Hong Kong stopover', 'TPE-PVG fare', '香港 機票', '澳門 住宿', 'Beijing (PEK)', 'Flights to China from €300', '서울-홍콩']) {
    assert.equal(mentionsChinaPlace(t), true, t);
  }
  for (const t of ['Cheap China Airlines flights to Taipei', 'YOU CAN FLY', '中國信託 華航聯名卡', 'Chinese New Year sale', 'Mandarin Airlines', 'Taiwan to Tokyo', '克拉克-台北-紐約']) {
    assert.equal(mentionsChinaPlace(t), false, t);
  }
});

test('resolvePlaces: whatever goes into a From / To box — codes, city names in three languages, or a mix', () => {
  assert.deepEqual(resolvePlaces('tpe'), { codes: ['TPE'] });
  assert.deepEqual(resolvePlaces(' NRT  HND '), { codes: ['NRT', 'HND'] });
  assert.deepEqual(resolvePlaces('東京'), { codes: ['NRT', 'HND'] });
  assert.deepEqual(resolvePlaces('Tokyo'), { codes: ['NRT', 'HND'] });
  assert.deepEqual(resolvePlaces('도쿄'), { codes: ['NRT', 'HND'] });
  assert.deepEqual(resolvePlaces('New York'), { codes: ['JFK', 'EWR', 'LGA'] });
  assert.deepEqual(resolvePlaces('London Heathrow'), { codes: ['LHR', 'LGW', 'STN', 'LTN', 'LCY'].filter((c) => resolvePlaces('LON').codes.includes(c)) });
  assert.deepEqual(resolvePlaces('克拉克, 台北'), { codes: ['CRK', 'TPE'] });
  assert.deepEqual(resolvePlaces('Clark / TPE'), { codes: ['CRK', 'TPE'] });
  assert.deepEqual(resolvePlaces('KEF'), { codes: ['KEF'] });
  assert.deepEqual(resolvePlaces('zzz'), { codes: ['ZZZ'] }, 'well-formed but unknown codes pass; the live search decides');
});

test('resolvePlaces: refuses China / Hong Kong / Macau however they are typed, and things that are not places', () => {
  for (const t of ['HKG', 'hkg', 'PVG', '香港', 'Hong Kong', 'Shanghai', '上海', 'TPE, HKG', 'Beijing', 'BJS']) assert.equal(resolvePlaces(t).error, 'blocked-airport', t);
  assert.equal(resolvePlaces('').error, 'airport');
  assert.equal(resolvePlaces('hello world').error, 'airport');
  assert.equal(resolvePlaces('12').error, 'airport');
  assert.deepEqual(resolvePlaces('Philippines'), { error: 'area', code: 'PH' });
  assert.deepEqual(resolvePlaces('歐洲'), { error: 'area', code: 'EU' });
  assert.equal(resolvePlaces('JFK EWR LGA BOS LAX').error, 'too-many');
  assert.equal(resolvePlaces('China').error, 'blocked-airport', 'the country itself is refused, not offered as an area');
});
