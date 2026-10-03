import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYBOOKS, playbook, playbooksFor, playCost, pick, COST_FIELDS, exampleLegs } from '../web/core/playbooks.js';
import { KIND_PLAYBOOK } from '../web/core/community.js';
import { normalizeSearch } from '../web/core/search.js';
import { mentionsChina } from '../web/core/community.js';

const LANGS = ['zh-TW', 'en', 'ko'];
const texts = (p) => [p.title, p.tagline, ...p.logic, ...p.steps, ...p.risks, ...p.tools.map((t) => t.label)];

test('every playbook is complete in all three languages', () => {
  assert.ok(PLAYBOOKS.length >= 7);
  for (const p of PLAYBOOKS) {
    assert.match(p.id, /^[a-z-]+$/);
    assert.ok(['low', 'medium', 'high'].includes(p.risk), p.id);
    assert.ok(p.effort >= 1 && p.effort <= 3, p.id);
    assert.ok(p.logic.length && p.steps.length && p.risks.length, `${p.id} needs logic, steps and risks`);
    for (const t of texts(p)) {
      for (const l of LANGS) assert.ok(typeof t[l] === 'string' && t[l].length > 3, `${p.id}: missing ${l} in ${JSON.stringify(t).slice(0, 60)}`);
    }
    assert.ok(p.cost.fields.every((f) => COST_FIELDS.includes(f)), p.id);
    for (const t of p.tools) assert.match(t.url, /^https:\/\//);
  }
  assert.equal(new Set(PLAYBOOKS.map((p) => p.id)).size, PLAYBOOKS.length);
});

test('the classifier only points at playbooks that exist', () => {
  for (const [, id] of KIND_PLAYBOOK) assert.ok(playbook(id), id);
  assert.equal(playbook('nope'), null);
  assert.deepEqual(playbooksFor(['error-fare']).map((p) => p.id), ['error-fare']);
  assert.ok(playbooksFor(['interline', 'multi-city']).map((p) => p.id).includes('interline-multicity'));
  assert.deepEqual(playbooksFor(['sale']), []);
});

test('hidden-city is labelled high risk and nothing in the library touches China / Hong Kong / Macau', () => {
  assert.equal(playbook('hidden-city').risk, 'high');
  for (const p of PLAYBOOKS) for (const t of texts(p)) for (const l of LANGS) assert.equal(mentionsChina(t[l]), false, `${p.id}: ${t[l].slice(0, 50)}`);
});

test('the Etihad example from the screenshots: three itineraries that really are searchable multi-city trips', () => {
  const p = playbook('interline-multicity');
  assert.equal(p.example.airline, 'EY');
  assert.deepEqual(p.example.items.map((i) => [i.price, i.bags]), [[562.79, true], [569.8, false], [579.1, false]]);
  for (const item of p.example.items) {
    const { search, error } = normalizeSearch({ trip: 'mc', segs: item.legs, cabin: item.cabin });
    assert.ok(search, `${item.id}: ${error}`);
    assert.equal(search.segs[0].o, 'CRK');
    assert.equal(search.segs[1].o, 'TPE', 'Taipei is in the middle of every example');
  }
  // 2026-10-04 is a Sunday, as on the screenshot ("週日, 04 10月")
  assert.equal(new Date('2026-10-04T00:00:00Z').getUTCDay(), 0);
  assert.equal(new Date('2026-11-01T00:00:00Z').getUTCDay(), 0);
  assert.equal(pick(p.title, 'zh-TW'), '菲律賓出發的聯運多段票（阿提哈德範例）');
  assert.match(pick(p.title, 'ko'), /에티하드/);
  assert.match(pick(p.title, 'fr'), /Etihad/, 'unknown languages fall back to English');
});

test('playCost: ticket in any currency + card fee + extras, compared with the direct fare', () => {
  const fx = { rates: { TWD: 1, USD: 0.0315 } };
  const c = playCost({ ticket: { amount: 562.79, currency: 'USD' }, extras: { positioning: 3500, baggage: 0, lodging: 800 }, fx, baselineTWD: 30000 });
  assert.equal(c.ticketTWD, 17866);
  assert.equal(c.fee, 268, '1.5% card fee on a foreign-currency ticket');
  assert.equal(c.extra, 4300);
  assert.equal(c.total, 22434);
  assert.equal(c.saving, 7566);
  assert.equal(c.savingPct, 25.2);
  const twd = playCost({ ticket: { amount: 20000, currency: 'TWD' }, extras: { positioning: '2000' }, baselineTWD: 18000 });
  assert.deepEqual([twd.fee, twd.total, twd.saving], [0, 22000, -4000], 'no card fee on a TWD ticket; being dearer is a negative saving');
  assert.equal(playCost({ ticket: { amount: 100, currency: 'XXX' }, fx }).total, null, 'unknown currency → no total');
  assert.equal(playCost({ ticket: { amount: 100, currency: 'USD' }, fx }).saving, null, 'no baseline → no saving');
  assert.equal(playCost({ ticket: { amount: 100, currency: 'USD' }, fx, feePct: 0 }).fee, 0);
});

test('exampleLegs moves the screenshot dates forward in whole weeks, keeping weekdays and spacing', () => {
  const item = playbook('interline-multicity').example.items[0]; // 2026-10-04, 10-09, 10-27
  const same = exampleLegs(item, '2026-09-01', 21);
  assert.deepEqual(same.map((l) => l.date), ['2026-10-04', '2026-10-09', '2026-10-27'], 'already far enough away: untouched');
  const later = exampleLegs(item, '2026-10-03', 21); // needs the first flight on/after 2026-10-24
  assert.deepEqual(later.map((l) => l.date), ['2026-10-25', '2026-10-30', '2026-11-17']);
  for (const [a, b] of item.legs.map((l, i) => [l.date, later[i].date])) assert.equal(new Date(`${a}T00:00:00Z`).getUTCDay(), new Date(`${b}T00:00:00Z`).getUTCDay());
  assert.deepEqual(later.map((l) => `${l.o}>${l.d}`), ['CRK>TPE', 'TPE>JFK', 'JFK>HKT']);
  const next = exampleLegs(item, '2027-03-01', 21);
  assert.ok(next[0].date >= '2027-03-22' && next[0].date < '2027-03-30');
});
