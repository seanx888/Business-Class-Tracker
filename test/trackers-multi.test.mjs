import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTracker, trackerCombos, comboCount, comboLegs, comboSearch, trackerFiltered, trackerExpired } from '../web/core/trackers.js';
import { sanitize } from '../web/api/trackers.mjs';
import { emptyTrackerState, planTrackerSearches, recordTrackerSample, recordTrackerPos, updateTrackerState, evaluateTrackerAlerts, pickTrackerMarkets } from '../scripts/lib/trackers.mjs';
import { formatTrackerAlert } from '../scripts/tracker-notify.mjs';
import { runScan } from '../scripts/scan.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const quiet = () => {};
const MC_SEGS = [
  { o: 'CRK', d: 'TPE', date: '2026-11-01' },
  { o: 'TPE', d: 'FCO', date: '2026-11-04' },
  { o: 'FCO', d: 'TPE', date: '2026-11-15' },
];
const MC = (over = {}) => normalizeTracker({ id: 'tmulti', trip: 'mc', segs: MC_SEGS, ...over }).tracker;
const RT = (over = {}) => normalizeTracker({ id: 'tplain', o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2027-01-05', ...over }).tracker;

test('old trackers keep exactly their old shape; new fields appear only when they are set', () => {
  const t = RT();
  assert.deepEqual(Object.keys(t), ['id', 'o', 'd', 'trip', 'mode', 'depart', 'return', 'flex', 'cabin', 'maxStops', 'target', 'alertOn', 'notify', 'label', 'paused', 'created']);
  assert.equal(trackerFiltered(t), false);
  const f = RT({ alliance: 'SKYTEAM', airlines: ['br', 'ke'], adults: 2, children: 1, bags: 1, maxHours: 24, pos: true });
  assert.deepEqual([f.alliance, f.airlines, f.adults, f.children, f.bags, f.maxHours, f.pos], ['SKYTEAM', ['BR', 'KE'], 2, 1, 1, 24, true]);
  assert.equal('infantsLap' in f, false);
  assert.equal(trackerFiltered(f), true);
  assert.equal(RT({ pos: 'yes' }).pos, undefined, 'only a real true turns it on');
  assert.equal(trackerFiltered(RT({ d: 'NRT,HND' })), true, 'several airports = a custom search');
  assert.equal(RT({ d: 'TYO' }).d, 'NRT,HND');
});

test('multi-city tracker: legs validated, first leg mirrored, China refused, auto id stable and filter-aware', () => {
  const t = MC();
  assert.deepEqual([t.trip, t.o, t.d, t.depart, t.return], ['mc', 'CRK', 'TPE', '2026-11-01', null]);
  assert.equal(t.segs.length, 3);
  assert.equal(normalizeTracker({ trip: 'mc', segs: [MC_SEGS[0], { o: 'TPE', d: 'HKG', date: '2026-11-04' }] }).error, 'blocked-airport');
  assert.equal(normalizeTracker({ trip: 'mc', segs: [MC_SEGS[0]] }).error, 'segments');
  assert.equal(normalizeTracker({ trip: 'mc', segs: [MC_SEGS[1], MC_SEGS[0]] }).error, 'segment-order');
  assert.equal(normalizeTracker({ o: 'TPE', d: 'CDG', depart: '2026-12-20', airlines: ['CA'] }).error, 'blocked-airline');
  const a = normalizeTracker({ trip: 'mc', segs: MC_SEGS }).tracker.id;
  assert.equal(normalizeTracker({ trip: 'mc', segs: MC_SEGS }).tracker.id, a);
  assert.notEqual(normalizeTracker({ trip: 'mc', segs: MC_SEGS, alliance: 'SKYTEAM' }).tracker.id, a, 'same legs, different alliance = different tracker');
  assert.equal(trackerFiltered(t), true);
});

test('flexible multi-city: the whole trip shifts together, never into the past', () => {
  const t = MC({ flex: 2 });
  assert.equal(comboCount(t), 5);
  const combos = trackerCombos(t, '2026-09-28');
  assert.equal(combos.length, 5);
  assert.deepEqual(combos[0], { dep: '2026-11-01', ret: null, dd: 0, dr: 0, key: '2026-11-01|' });
  const shifted = combos.find((c) => c.dd === 2);
  assert.deepEqual(comboLegs(t, shifted).map((l) => l.date), ['2026-11-03', '2026-11-06', '2026-11-17']);
  const late = trackerCombos(t, '2026-11-01');
  assert.ok(late.every((c) => c.dep > '2026-11-01'));
  assert.equal(trackerExpired(t, '2026-11-03'), true);
  assert.equal(trackerExpired(t, '2026-11-02'), false);
  const s = comboSearch(t, shifted);
  assert.equal(s.trip, 'mc');
  assert.equal(s.segs[2].date, '2026-11-17');
  assert.equal(s.depart, '2026-11-03');
  // round trips are unchanged: independent shifts of both dates
  assert.equal(trackerCombos(RT({ flex: 2 }), '2026-09-28').length, 25);
});

test('planTrackerSearches: every query carries its full search and a filtered flag', () => {
  const trackers = [MC({ flex: 1 }), RT(), RT({ id: 'tstar', alliance: 'STAR' })];
  const plan = planTrackerSearches(trackers, emptyTrackerState(), { today: '2026-09-28', budget: 10 });
  const mc = plan.filter((q) => q.trackerId === 'tmulti');
  assert.equal(mc.length, 2, 'flexible: two searches a day');
  assert.equal(mc[0].key, 'MC:CRK-TPE-FCO-TPE');
  assert.equal(mc[0].search.trip, 'mc');
  assert.equal(mc[0].filtered, true);
  assert.equal(mc[0].origin, 'CRK');
  const plain = plan.find((q) => q.trackerId === 'tplain');
  assert.equal(plain.filtered, false);
  assert.equal(plain.key, 'TPE-CDG');
  assert.equal(plain.search.return, '2027-01-05');
  assert.equal(plan.find((q) => q.trackerId === 'tstar').search.alliance, 'STAR');
});

test('the sync API keeps the new fields, trims them, and drops the rest', () => {
  const [t] = sanitize([{
    id: 'tmulti', o: 'CRK', d: 'TPE', depart: '2026-11-01', trip: 'mc',
    segs: [...MC_SEGS, MC_SEGS[0], { o: 'x'.repeat(40), d: 'y', date: '2026-11-30junk-junk-junk' }, MC_SEGS[2]],
    airlines: ['BR', 'KE', 1, 'ABCDEFGHIJKL'], alliance: 'SKYTEAM', adults: 2, pos: true, evil: 'x',
  }]);
  assert.equal(t.segs.length, 5, 'at most five legs');
  assert.equal(t.segs[4].o.length, 15);
  assert.equal(t.segs[4].date.length, 10);
  assert.deepEqual(t.airlines, ['BR', 'KE', 'ABCDEFGH']);
  assert.deepEqual([t.alliance, t.adults, t.pos, t.evil], ['SKYTEAM', 2, true, undefined]);
  assert.equal(sanitize([{ o: 'NRT,HND,KIX,ITM,ZZZ', d: 'TPE', depart: '2026-11-01' }])[0].o.length, 15);
});

// ── the scan ──
async function sandbox() {
  const dir = await mkdtemp(path.join(tmpdir(), 'bct-mc-'));
  await mkdir(path.join(dir, 'config'), { recursive: true });
  await cp(path.join(ROOT, 'config', 'airport-countries.json'), path.join(dir, 'config', 'airport-countries.json'));
  const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config', 'routes.json')));
  await writeFile(path.join(dir, 'config', 'routes.json'), JSON.stringify({ ...cfg, watchTrips: [] }));
  return dir;
}

test('demo scan: multi-city, alliance-filtered and country-checking trackers work end to end and stay out of the deal list', async () => {
  const root = await sandbox();
  const outDir = path.join(root, 'out');
  const TRACKERS = JSON.stringify([
    { id: 'tmulti', trip: 'mc', segs: [{ o: 'TPE', d: 'SIN', date: '2026-11-10' }, { o: 'SIN', d: 'LAX', date: '2026-11-14' }, { o: 'LAX', d: 'TPE', date: '2026-11-24' }], label: 'World trip', pos: true },
    { id: 'tstar', o: 'TPE', d: 'NRT', depart: '2026-11-10', return: '2026-11-15', alliance: 'STAR', adults: 2, pos: true },
    { id: 'tplain', o: 'TPE', d: 'KIX', depart: '2026-11-10', return: '2026-11-15' },
  ]);
  const env = { FARE_PROVIDER: 'demo', OFFLINE: '1', TRACKERS };
  const first = await runScan({ root, outDir, env, today: '2026-09-28', log: quiet });
  const data = JSON.parse(await readFile(path.join(outDir, 'trackers.json'), 'utf8'));
  assert.equal(data.trackers.tmulti.status, 'tracking');
  assert.equal(data.trackers.tmulti.def.segs.length, 3, 'public definition carries the legs');
  assert.ok(!JSON.stringify(data).includes('World trip'), 'labels stay private');
  assert.ok(data.trackers.tmulti.best.p > 0);
  assert.equal(data.trackers.tstar.status, 'tracking');
  assert.ok(data.trackers.tstar.def.alliance === 'STAR');
  const star = data.trackers.tstar.best;
  assert.ok(['BR', 'NH', 'OZ', 'SQ', 'TG', 'UA', 'LH', 'TK'].includes(star.c), `Star Alliance only, got ${star.c}`);
  assert.ok(data.trackers.tmulti.pos?.markets?.length >= 1, 'a country was priced');
  assert.ok(data.trackers.tstar.pos?.markets?.length >= 1);
  assert.equal(data.trackers.tplain.pos, undefined, 'no pos flag, no country checks');
  const deals = JSON.parse(await readFile(path.join(outDir, 'deals.json'), 'utf8'));
  assert.ok(!deals.deals.some((d) => d.routeKey.startsWith('MC:')), 'multi-city never lands in the deal list');
  assert.ok(!deals.deals.some((d) => d.routeKey === 'TPE-NRT' && d.departDate === '2026-11-10' && d.returnDate === '2026-11-15'), 'filtered results do not feed the deal list');
  assert.ok(deals.deals.some((d) => d.routeKey === 'TPE-KIX' && d.departDate === '2026-11-10'), 'a plain tracker still does');
  assert.equal(first.trackerAlerts.filter((a) => a.kind === 'start').length, 3);

  // day 2: another market is priced (the one checked longest ago)
  const second = await runScan({ root, outDir, env, today: '2026-09-29', log: quiet });
  const pos = second.trackerState.trackers.tstar.pos;
  assert.equal(pos.markets.length, 2);
  assert.notEqual(pos.markets[0].country, pos.markets[1].country);
});

test('multi-city / alliance searches reach SerpApi as multi_city_json / include_airlines; country checks use that market', async () => {
  const root = await sandbox();
  const outDir = path.join(root, 'out');
  const serp = readFileSync(new URL('./fixtures/serpapi-tpe-cdg.json', import.meta.url), 'utf8');
  const searches = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'serpapi.com' && u.pathname === '/search.json') {
      searches.push(u.searchParams);
      return new Response(serp);
    }
    throw new Error('offline');
  };
  const env = {
    SERPAPI_KEY: 'k', SEARCHES_PER_RUN: '8', SCAN_DELAY_MS: '0', OFFLINE: '1',
    TRACKERS: JSON.stringify([
      { id: 'tmulti', trip: 'mc', segs: [{ o: 'TPE', d: 'CDG', date: '2026-12-20' }, { o: 'CDG', d: 'FCO', date: '2026-12-25' }, { o: 'FCO', d: 'TPE', date: '2027-01-05' }], cabin: 'first' },
      { id: 'tsky', o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2027-01-05', alliance: 'SKYTEAM', maxStops: 1, pos: true },
    ]),
  };
  const { trackerState } = await runScan({ root, outDir, env, fetchImpl, today: '2026-09-28', log: quiet });
  const mc = searches.find((p) => p.get('type') === '3');
  assert.ok(mc, 'multi-city search sent');
  assert.equal(JSON.parse(mc.get('multi_city_json')).length, 3);
  assert.equal(mc.get('travel_class'), '4');
  const sky = searches.find((p) => p.has('include_airlines'));
  assert.ok(sky.get('include_airlines').split(',').includes('KE'));
  assert.equal(sky.get('stops'), '2', 'one stop or fewer');
  assert.equal(sky.has('exclude_airlines'), false);
  const posCall = searches.find((p) => p.get('gl') !== 'tw');
  assert.ok(posCall, 'one other country was priced for the pos tracker');
  assert.equal(posCall.get('currency').length, 3);
  assert.equal(trackerState.trackers.tsky.pos.markets.length, 1);
});

test('tracker country check: markets rotate, alerts fire once, and the mail says where to pay', () => {
  const t = RT({ id: 'tpos', pos: true, label: 'Paris NYE' });
  const state = emptyTrackerState();
  const offer = { priceTWD: 100000, primaryCarrier: 'BR', stops: 0, via: [], lieFlat: true, legs: [{ durationMin: 800, segments: [{ flightNumber: 'BR 87', carrier: 'BR' }] }] };
  recordTrackerSample(state, { trackerId: 'tpos', departDate: '2026-12-20', returnDate: '2027-01-05', maxStops: null }, [offer], { today: '2026-10-01' });
  updateTrackerState(state, [t], '2026-10-01');
  assert.deepEqual(evaluateTrackerAlerts(state, [t], '2026-10-01').map((a) => a.kind), ['start']);

  const markets = [{ country: 'VN', currency: 'VND' }, { country: 'TH', currency: 'THB' }, { country: 'TW', currency: 'TWD' }];
  assert.deepEqual(pickTrackerMarkets(state.trackers.tpos.pos, markets).map((m) => m.country), ['VN'], 'never the home market');
  recordTrackerPos(state, 'tpos', { country: 'VN', currency: 'VND', price: 2400000, priceTWD: 88000, savingsTWD: 12000, savingsPct: 12, match: 'exact' }, '2026-10-02');
  assert.deepEqual(pickTrackerMarkets(state.trackers.tpos.pos, markets, { n: 2 }).map((m) => m.country), ['TH', 'VN'], 'unchecked markets first, then the oldest check');
  assert.equal(state.trackers.tpos.pos.best.country, 'VN');

  // day 2: no price change, but the VN site is 12% cheaper → one 'pos' alert, none the day after
  recordTrackerSample(state, { trackerId: 'tpos', departDate: '2026-12-20', returnDate: '2027-01-05', maxStops: null }, [offer], { today: '2026-10-02' });
  updateTrackerState(state, [t], '2026-10-02');
  const alerts = evaluateTrackerAlerts(state, [t], '2026-10-02');
  assert.deepEqual(alerts.map((a) => a.kind), ['pos']);
  assert.equal(alerts[0].pos.country, 'VN');
  recordTrackerSample(state, { trackerId: 'tpos', departDate: '2026-12-20', returnDate: '2027-01-05', maxStops: null }, [offer], { today: '2026-10-03' });
  recordTrackerPos(state, 'tpos', { country: 'VN', currency: 'VND', price: 2390000, priceTWD: 87800, savingsTWD: 12200, savingsPct: 12.2, match: 'exact' }, '2026-10-03');
  updateTrackerState(state, [t], '2026-10-03');
  assert.deepEqual(evaluateTrackerAlerts(state, [t], '2026-10-03'), [], 'already told about the VN site');
  // a "no such flights there" answer is remembered but never wins
  recordTrackerPos(state, 'tpos', { country: 'TH', none: true }, '2026-10-03');
  assert.equal(state.trackers.tpos.pos.best.country, 'VN');

  const a = alerts[0];
  const zh = formatTrackerAlert(a, 'zh-TW');
  assert.match(zh.subject, /🌏 在越南站結帳更便宜（省 12%）：TPE→CDG NT\$100,000 · Paris NYE/);
  assert.match(zh.text, /其他國家結帳: 越南 · NT\$88,000 \(−12%\)/);
  assert.match(formatTrackerAlert(a, 'en').subject, /12% cheaper on the Vietnam site/);
  assert.match(formatTrackerAlert(a, 'ko').subject, /베트남 사이트에서 결제하면 12% 저렴/);
});

test('alert mail for a multi-city tracker names every stop and links to the full trip', () => {
  const t = MC({ label: 'Etihad trick' });
  const best = { p: 21000, dep: '2026-11-01', ret: null, c: 'EY', s: 1, key: '2026-11-01|', fl: ['PR 1 · EY 867 · EY 83'] };
  const mail = formatTrackerAlert({ tracker: t, kind: 'start', best, prev: null }, 'zh-TW', 'https://app.example/');
  assert.match(mail.subject, /開始追蹤 CRK→TPE→FCO→TPE/);
  assert.match(mail.text, /克拉克 → 台北桃園 → 羅馬 → 台北桃園/);
  assert.match(mail.text, /11\/1.* – .*11\/15/);
  assert.match(mail.url, /[?&]tfs=/, 'the Google link carries all three legs');
  const en = formatTrackerAlert({ tracker: t, kind: 'drop', best, prev: { p: 25000 } }, 'en');
  assert.match(en.subject, /Price dropped NT\$4,000: CRK→TPE→FCO→TPE now NT\$21,000/);
});
