import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkItinerary, isChinaFree } from '../web/core/exclusion.js';
import { isBlockedCarrierCode, isBlockedCarrierName, allianceOf, isLccItinerary } from '../web/core/airlines.js';
import { airportCountry } from '../web/core/airports.js';

const seg = (from, to, carrier, extra = {}) => ({ from, to, carrier, ...extra });
const itin = (...legs) => ({ legs: legs.map((segments) => ({ segments, layovers: segments.slice(0, -1).map((s) => ({ airport: s.to })) })) });

test('China Airlines (CI, Taiwan) nonstop TPE–CDG is allowed', () => {
  const r = checkItinerary(itin([seg('TPE', 'CDG', 'CI', { carrierName: 'China Airlines' })], [seg('CDG', 'TPE', 'CI')]));
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
});

test('China Airlines name is never mistaken for a mainland carrier', () => {
  assert.equal(isBlockedCarrierName('China Airlines'), false);
  assert.equal(isBlockedCarrierName('中華航空'), false);
  assert.equal(isBlockedCarrierName('Mandarin Airlines'), false);
  assert.equal(isBlockedCarrierCode('CI'), false);
  assert.equal(allianceOf('CI'), 'SKYTEAM');
});

test('mainland, Hong Kong and Macau carriers are blocked by code', () => {
  for (const c of ['CA', 'MU', 'CZ', 'HU', 'MF', '3U', 'ZH', 'HO', '9C', 'CX', 'UO', 'HX', 'HB', 'NX']) {
    assert.equal(isBlockedCarrierCode(c), true, c);
  }
});

test('blocked carrier names (incl. unfamiliar "China …" brands) are caught', () => {
  for (const n of ['Air China', 'China Eastern Airlines', 'China Southern Airlines', 'Cathay Pacific', 'HK Express', 'Air Macau', 'Greater Bay Airlines', 'China Something New Air']) {
    assert.equal(isBlockedCarrierName(n), true, n);
  }
  for (const n of ['EVA Air', 'STARLUX Airlines', 'Korean Air', 'Vietnam Airlines', 'Delta']) {
    assert.equal(isBlockedCarrierName(n), false, n);
  }
});

test('Cathay Pacific via HKG is excluded (carrier + airport)', () => {
  const r = checkItinerary(itin([seg('TPE', 'HKG', 'CX'), seg('HKG', 'LHR', 'CX')]));
  assert.equal(r.ok, false);
  assert.equal(r.category, 'china');
  assert.ok(r.reasons.some((x) => x.type === 'CARRIER'));
  assert.ok(r.reasons.some((x) => x.type === 'AIRPORT' && x.code === 'HKG'));
});

test('a non-Chinese carrier connecting in Hong Kong is still excluded', () => {
  const r = checkItinerary(itin([seg('TPE', 'HKG', 'TG'), seg('HKG', 'BKK', 'TG')]));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.code === 'HKG'));
});

test('Macau and mainland connections are excluded', () => {
  assert.equal(checkItinerary(itin([seg('TPE', 'MFM', 'BR'), seg('MFM', 'BKK', 'BR')])).ok, false);
  assert.equal(checkItinerary(itin([seg('ICN', 'PVG', 'KE'), seg('PVG', 'CDG', 'AF')])).ok, false);
});

test('only the RETURN leg touching China is enough to exclude', () => {
  const r = checkItinerary(itin([seg('TPE', 'LAX', 'BR')], [seg('LAX', 'CAN', 'DL'), seg('CAN', 'TPE', 'DL')]));
  assert.equal(r.ok, false);
});

test('codeshare operated by a Chinese carrier is excluded (code or name)', () => {
  assert.equal(checkItinerary(itin([seg('ICN', 'LAX', 'DL', { operatingCarrier: 'MU' })])).ok, false);
  assert.equal(checkItinerary(itin([seg('ICN', 'LAX', 'KE', { operatingName: 'China Southern Airlines' })])).ok, false);
  // Operated by Mandarin Airlines (Taiwan) for China Airlines — fine.
  assert.equal(checkItinerary(itin([seg('TPE', 'KHH', 'CI', { operatingName: 'Mandarin Airlines' })])).ok, true);
});

test('technical stop in China is excluded', () => {
  const r = checkItinerary(itin([seg('TPE', 'JFK', 'BR', { stops: [{ airport: 'PEK' }] })]));
  assert.equal(r.ok, false);
});

test('layover named Hong Kong is excluded even without a code match', () => {
  const r = checkItinerary({ legs: [{ segments: [seg('TPE', 'XXA', 'BR', { toCountry: 'TW' }), seg('XXA', 'BKK', 'BR', { fromCountry: 'TW' })], layovers: [{ airport: 'XXA', country: 'TW', name: 'Hong Kong International Airport' }] }] });
  assert.equal(r.ok, false);
});

test('provider-supplied country cannot whitelist a known Chinese airport', () => {
  const r = checkItinerary({ legs: [{ segments: [seg('TPE', 'PVG', 'KE', { toCountry: 'KR' }), seg('PVG', 'ICN', 'KE', { fromCountry: 'KR' })] }] });
  assert.equal(r.ok, false);
});

test('unknown airport country is rejected (fail-closed) but allowed in lenient mode', () => {
  const x = itin([seg('TPE', 'QQQ', 'BR'), seg('QQQ', 'LAX', 'BR')]);
  const strict = checkItinerary(x);
  assert.equal(strict.ok, false);
  assert.equal(strict.category, 'unverified');
  assert.equal(isChinaFree(x), true);
  // …and resolved by the OurAirports-derived map
  assert.equal(checkItinerary(x, { countries: { QQQ: 'JP' } }).ok, true);
  assert.equal(checkItinerary(x, { countries: { QQQ: 'CN' } }).ok, false);
});

test('empty itinerary is rejected', () => {
  assert.equal(checkItinerary({ legs: [] }).ok, false);
  assert.equal(checkItinerary({}).ok, false);
});

test('Taiwan airports are TW, not CN', () => {
  for (const c of ['TPE', 'TSA', 'KHH', 'RMQ']) assert.equal(airportCountry(c), 'TW');
  assert.equal(airportCountry('HKG'), 'HK');
  assert.equal(airportCountry('MFM'), 'MO');
  assert.equal(airportCountry('PEK'), 'CN');
});

test('LCC detection: any low-cost carrier on the itinerary makes it LCC; full-service carriers never are', () => {
  assert.equal(isLccItinerary(['VJ']), true);
  assert.equal(isLccItinerary(['BR', 'TW']), true);
  for (const c of ['CI', 'BR', 'JX', 'KE', 'VN', 'SQ', 'TG', 'PR', 'VA', 'EK']) assert.equal(isLccItinerary([c]), false, c);
  assert.equal(isLccItinerary([]), false);
});
