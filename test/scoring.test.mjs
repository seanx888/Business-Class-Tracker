import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeItinerary, pickReference, scoreDeal, rankDeals, pricePerKm, median } from '../web/core/scoring.js';

const base = (over = {}) => ({
  id: Math.random().toString(36),
  origin: 'TPE', destination: 'CDG', departDate: '2026-11-10', returnDate: '2026-11-24',
  priceTWD: 120000, reference: { source: 'google', value: 150000, low: 130000, high: 170000 },
  alliance: 'NONE', stops: 1, lieFlat: true, mixedCabin: false, longestLayoverMin: 120, overnightLayover: false,
  originType: 'home', ...over,
});

test('summarizeItinerary: carriers, alliance, stops, lie-flat, via home', () => {
  const s = summarizeItinerary({
    legs: [{
      segments: [
        { from: 'BKK', to: 'TPE', carrier: 'CI', durationMin: 230, cabin: 'Business', lieFlat: true },
        { from: 'TPE', to: 'LAX', carrier: 'CI', durationMin: 690, cabin: 'Business', lieFlat: true },
      ],
      layovers: [{ airport: 'TPE', durationMin: 150 }],
    }],
  });
  assert.equal(s.primaryCarrier, 'CI');
  assert.equal(s.alliance, 'SKYTEAM');
  assert.equal(s.stops, 1);
  assert.equal(s.lieFlat, true);
  assert.equal(s.viaHome, true);
  assert.equal(s.mixedCabin, false);
  assert.ok(s.flownKm > 12000 && s.flownKm < 14000, String(s.flownKm));
});

test('summarizeItinerary: mixed cabin + recliner on long flight detected', () => {
  const s = summarizeItinerary({
    legs: [{ segments: [
      { from: 'TPE', to: 'ICN', carrier: 'KE', durationMin: 150, cabin: 'Economy' },
      { from: 'ICN', to: 'CDG', carrier: 'KE', durationMin: 800, cabin: 'Business', lieFlat: false },
    ] }],
  });
  assert.equal(s.mixedCabin, true);
  assert.equal(s.lieFlat, false);
});

test('pickReference prefers Google range, then history (≥5 obs), then benchmark', () => {
  assert.equal(pickReference({ insights: { typicalRange: [100, 200] } }).source, 'google');
  assert.equal(pickReference({ historyMedian: 150, historyCount: 5, benchmark: { typical: 9 } }).source, 'history');
  assert.equal(pickReference({ historyMedian: 150, historyCount: 2, benchmark: { typical: 9, deal: 5 } }).source, 'benchmark');
  assert.equal(pickReference({}), null);
});

test('cheaper is better; SkyTeam gets a nudge but price still dominates', () => {
  const cheapStar = scoreDeal(base({ priceTWD: 95000, alliance: 'STAR' }));
  const pricierSky = scoreDeal(base({ priceTWD: 125000, alliance: 'SKYTEAM' }));
  assert.ok(cheapStar.score > pricierSky.score);
  const sky = scoreDeal(base({ alliance: 'SKYTEAM' }));
  const star = scoreDeal(base({ alliance: 'STAR' }));
  const none = scoreDeal(base({ alliance: 'NONE' }));
  assert.ok(sky.score > star.score && star.score > none.score);
  assert.equal(scoreDeal(base({ alliance: 'SKYTEAM' }), { skyteamBoost: 'off' }).score, none.score);
});

test('equal price → SkyTeam ranked first in every sort', () => {
  const deals = [base({ alliance: 'ONEWORLD' }), base({ alliance: 'STAR' }), base({ alliance: 'SKYTEAM' }), base({ alliance: 'NONE' })];
  for (const sort of ['score', 'price', 'alliance']) {
    assert.equal(rankDeals(deals, sort)[0].alliance, 'SKYTEAM', sort);
  }
});

test('product quality adjusts score', () => {
  const ref = scoreDeal(base()).score;
  assert.ok(scoreDeal(base({ stops: 0 })).score > ref);
  assert.ok(scoreDeal(base({ mixedCabin: true })).score < ref);
  assert.ok(scoreDeal(base({ lieFlat: false })).score < ref);
  assert.ok(scoreDeal(base({ budget: true })).score < ref);
});

test('tiers and error-fare flag', () => {
  assert.equal(scoreDeal(base({ priceTWD: 150000 })).tier, 'fair');
  const hot = scoreDeal(base({ priceTWD: 70000, stops: 0 }));
  assert.equal(hot.tier, 'hot');
  assert.equal(hot.errorFare, true);
  assert.equal(scoreDeal(base({ priceTWD: 70000, budget: true })).errorFare, false);
  assert.equal(scoreDeal(base({ priceTWD: 120000 })).discountPct, 20);
});

test('price per km uses round-trip distance', () => {
  const d = base({ flownKm: 10000, priceTWD: 100000 });
  assert.equal(pricePerKm(d), 5);
  assert.equal(pricePerKm({ ...d, returnDate: null }), 10);
});

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});
