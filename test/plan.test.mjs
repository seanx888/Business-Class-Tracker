import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlan, rotationSlots, pickDates, addDays } from '../scripts/lib/plan.mjs';

const config = JSON.parse(readFileSync(new URL('../config/routes.json', import.meta.url)));

test('routes.json is well-formed', () => {
  const keys = new Set();
  for (const r of config.routes) {
    assert.match(r.o, /^[A-Z]{3}$/);
    assert.match(r.d, /^[A-Z]{3}$/);
    assert.ok(config.origins[r.o], `origin ${r.o} missing from origins`);
    assert.ok(config.benchmarks[r.bm], `benchmark ${r.bm} missing`);
    assert.ok([1, 2, 3].includes(r.p));
    const k = `${r.o}-${r.d}`;
    assert.ok(!keys.has(k), `duplicate ${k}`);
    keys.add(k);
  }
});

test('no configured route starts or ends in China / HK / Macau', () => {
  const banned = /^(HKG|MFM|PEK|PKX|PVG|SHA|CAN|SZX|CTU|TFU|CKG|XMN)$/;
  for (const r of config.routes) assert.ok(!banned.test(r.o) && !banned.test(r.d), `${r.o}-${r.d}`);
});

test('priority weighting: p1 routes get 3 slots, p3 get 1', () => {
  const slots = rotationSlots([{ p: 1 }, { p: 2 }, { p: 3 }]);
  assert.deepEqual(slots.filter((i) => i === 0).length, 3);
  assert.deepEqual(slots.filter((i) => i === 1).length, 2);
  assert.deepEqual(slots.filter((i) => i === 2).length, 1);
});

test('plan respects budget, has no duplicate routes, dates in the future', () => {
  const today = '2026-09-26';
  const plan = buildPlan(config, { today, maxSearches: 8 });
  assert.equal(plan.length, 8);
  assert.equal(new Set(plan.map((p) => p.key)).size, 8);
  for (const p of plan) {
    assert.ok(p.departDate > today);
    assert.ok(p.returnDate > p.departDate);
  }
});

test('rotation covers every route within a few weeks on the free tier budget', () => {
  const seen = new Set();
  let day = '2026-09-26';
  for (let i = 0; i < 21; i++) {
    for (const p of buildPlan(config, { today: day, maxSearches: 8 })) seen.add(p.key);
    day = addDays(day, 1);
  }
  assert.equal(seen.size, config.routes.length);
});

test('watch trips go first and past trips are skipped', () => {
  const cfg = { ...config, watchTrips: [
    { o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2027-01-05', label: 'Paris NYE' },
    { o: 'TPE', d: 'NRT', depart: '2026-01-01', return: '2026-01-05' },
  ] };
  const plan = buildPlan(cfg, { today: '2026-09-26', maxSearches: 5 });
  assert.equal(plan[0].kind, 'watch');
  assert.equal(plan[0].label, 'Paris NYE');
  assert.equal(plan.filter((p) => p.kind === 'watch').length, 1);
  assert.equal(plan.length, 5);
});

test('short-haul looks 2–20 weeks out, long-haul 1–9 months', () => {
  for (let i = 0; i < 50; i++) {
    const s = pickDates({ stay: 5 }, i, '2026-09-26', i);
    const l = pickDates({ stay: 12 }, i, '2026-09-26', i);
    const off = (d) => (Date.parse(d) - Date.parse('2026-09-26')) / 86400000;
    assert.ok(off(s.departDate) >= 14 && off(s.departDate) < 150);
    assert.ok(off(l.departDate) >= 30 && off(l.departDate) < 270);
  }
});
