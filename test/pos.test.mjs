import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMarkets, matchOffer, posResult, summarizePos, outboundSignature } from '../scripts/lib/pos.mjs';
import { daysLeftInMonth } from '../scripts/scan.mjs';

const MARKETS = ['VN', 'TH', 'ID', 'PH', 'MY', 'SG', 'KR', 'JP', 'IN', 'US'].map((c) => ({ country: c, currency: 'X' + c }));
const seg = (from, to, carrier, n) => ({ from, to, carrier, flightNumber: `${carrier} ${n}` });
const deal = (over = {}) => ({
  id: 'd', routeKey: 'TPE-CDG', origin: 'TPE', destination: 'CDG', primaryCarrier: 'CI', priceTWD: 100000,
  legs: [{ segments: [seg('TPE', 'CDG', 'CI', 51)] }], ...over,
});

test('markets: ticket-origin country first, then airline home market, never Taiwan', () => {
  const exBkkOnVn = deal({ origin: 'BKK', routeKey: 'BKK-CDG', primaryCarrier: 'VN', legs: [{ segments: [seg('BKK', 'SGN', 'VN', 1), seg('SGN', 'CDG', 'VN', 2)] }] });
  const m = pickMarkets(exBkkOnVn, MARKETS, { perDeal: 3 });
  assert.deepEqual(m.slice(0, 2).map((x) => x.country), ['TH', 'VN']);
  assert.equal(m.length, 3);
  const tpeCi = pickMarkets(deal(), [{ country: 'TW', currency: 'TWD' }, ...MARKETS], { perDeal: 4 });
  assert.ok(!tpeCi.some((x) => x.country === 'TW'), 'home market is the baseline, never re-checked');
  assert.equal(new Set(tpeCi.map((x) => x.country)).size, 4);
});

test('markets rotate day by day so every market gets sampled', () => {
  const seen = new Set();
  for (let day = 0; day < 12; day++) for (const m of pickMarkets(deal(), MARKETS, { perDeal: 1, dayIdx: day })) seen.add(m.country);
  assert.ok(seen.size >= 8, `only ${[...seen].join(',')}`);
});

test('matching: same outbound flights first, then same airline & number of stops; China routings never match', () => {
  const same = { price: 900, currency: 'XVN', legs: [{ segments: [seg('TPE', 'CDG', 'CI', 51)] }] };
  const other = { price: 700, currency: 'XVN', legs: [{ segments: [seg('TPE', 'CDG', 'CI', 55)] }] };
  const viaHkg = { price: 100, currency: 'XVN', legs: [{ segments: [seg('TPE', 'HKG', 'CX', 1), seg('HKG', 'CDG', 'CX', 2)] }] };
  assert.equal(matchOffer(deal(), [other, same, viaHkg]).match, 'exact');
  assert.equal(matchOffer(deal(), [other, same, viaHkg]).offer, same);
  const fallback = matchOffer(deal(), [other, viaHkg]);
  assert.equal(fallback.match, 'carrier');
  assert.equal(fallback.offer, other);
  assert.equal(matchOffer(deal(), [viaHkg]), null);
  assert.equal(outboundSignature(deal().legs), 'CI51');
});

test('result math converts to TWD and summary only flags meaningful savings', () => {
  const fx = { rates: { XVN: 800 } }; // 1 TWD = 800 XVN
  const r = posResult(deal(), { country: 'vn', currency: 'XVN' }, { offer: { price: 72_000_000, currency: 'XVN' }, match: 'exact' }, fx);
  assert.deepEqual(r, { country: 'VN', currency: 'XVN', price: 72_000_000, priceTWD: 90000, match: 'exact', savingsTWD: 10000, savingsPct: 10 });
  const pricier = { ...r, country: 'JP', priceTWD: 101000, savingsTWD: -1000, savingsPct: -1 };
  const tiny = { ...r, country: 'TH', priceTWD: 99000, savingsTWD: 1000, savingsPct: 1 };
  assert.equal(summarizePos([pricier, r, tiny], '2026-09-27').best.country, 'VN');
  assert.equal(summarizePos([pricier, tiny], '2026-09-27').best, null, '1% is noise, not a deal');
  assert.equal(summarizePos([pricier, r], '2026-09-27').markets[0].country, 'VN', 'cheapest first');
});

test('quota pacing helper counts today', () => {
  assert.equal(daysLeftInMonth('2026-09-27'), 4);
  assert.equal(daysLeftInMonth('2026-09-30'), 1);
  assert.equal(daysLeftInMonth('2026-02-01'), 28);
});
