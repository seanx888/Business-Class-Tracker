import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTracker, parseTrackers, trackerCombos, comboCount, searchesPerDay, trackerExpired, bestSample } from '../web/core/trackers.js';
import { emptyTrackerState, planTrackerSearches, recordTrackerSample, updateTrackerState, evaluateTrackerAlerts } from '../scripts/lib/trackers.mjs';
import { formatTrackerAlert, sendTrackerAlerts } from '../scripts/tracker-notify.mjs';
import { runScan } from '../scripts/scan.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const quiet = () => {};
const T = (over = {}) => normalizeTracker({ id: 'tparis', o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2027-01-05', ...over }).tracker;

test('normalizeTracker: cleans input, refuses China/HK/Macau and bad dates', () => {
  const t = T({ o: 'tpe', flex: 3, cabin: 'first', notify: ['Sean', 'bad name!'], target: '90000.4', label: '  Paris NYE ' });
  assert.equal(t.o, 'TPE');
  assert.equal(t.mode, 'flex');
  assert.equal(t.flex, 3);
  assert.equal(t.cabin, 'first');
  assert.deepEqual(t.notify, ['sean']);
  assert.equal(t.target, 90000);
  assert.equal(t.label, 'Paris NYE');
  assert.equal(T({ flex: 30 }).flex, 7, 'flex is capped');
  assert.equal(T({ mode: 'fixed', flex: 3 }).mode, 'fixed');
  assert.equal(T({ cabin: 'suite' }).cabin, 'business');
  assert.equal(T({ return: null }).trip, 'ow');
  assert.equal(normalizeTracker({ o: 'TPE', d: 'HKG', depart: '2026-12-20' }).error, 'blocked-airport');
  assert.equal(normalizeTracker({ o: 'PVG', d: 'NRT', depart: '2026-12-20' }).error, 'blocked-airport');
  assert.equal(normalizeTracker({ o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2026-12-10' }).error, 'return-before-depart');
  assert.equal(normalizeTracker({ o: 'TPE', d: 'CDG', depart: '20/12/2026' }).error, 'depart');
  const auto = normalizeTracker({ o: 'TPE', d: 'NRT', depart: '2026-11-01' }).tracker;
  assert.match(auto.id, /^t[a-z0-9]+$/);
  assert.equal(normalizeTracker({ o: 'TPE', d: 'NRT', depart: '2026-11-01' }).tracker.id, auto.id, 'id is stable');
});

test('parseTrackers: merges sources, skips invalid JSON and duplicates', () => {
  const logs = [];
  const list = parseTrackers([[{ id: 'a1234', o: 'TPE', d: 'NRT', depart: '2026-11-01' }], '[{"id":"a1234","o":"TPE","d":"KIX","depart":"2026-11-01"},{"o":"TPE","d":"ICN","depart":"2026-11-02"}]', 'not json'], (m) => logs.push(m));
  assert.equal(list.length, 2);
  assert.equal(list[0].d, 'NRT');
  assert.ok(logs.some((l) => /not valid JSON/.test(l)));
});

test('trackerCombos: exact dates first, then same-length shifts, never in the past', () => {
  const t = T({ flex: 2 });
  const combos = trackerCombos(t, '2026-09-28');
  assert.equal(combos.length, 25);
  assert.equal(comboCount(t), 25);
  assert.equal(searchesPerDay(t), 2);
  assert.deepEqual([combos[0].dd, combos[0].dr], [0, 0]);
  assert.deepEqual(combos.slice(1, 5).map((c) => c.dd === c.dr), [true, true, true, true]);
  // Near departure the past dates drop out.
  const late = trackerCombos(T({ flex: 2 }), '2026-12-19');
  assert.ok(late.every((c) => c.dep > '2026-12-19'));
  assert.equal(trackerCombos(T({ return: null, flex: 3 }), '2026-09-28').length, 7);
  assert.equal(trackerExpired(T({ flex: 2 }), '2026-12-21'), false);
  assert.equal(trackerExpired(T({ flex: 2 }), '2026-12-22'), true);
});

test('planTrackerSearches: one search each first, flex extras after, least-recently-searched first', () => {
  const trackers = [T({ id: 'tfixed', mode: 'fixed' }), T({ id: 'tflexy', flex: 3 }), T({ id: 'tpaused', paused: true })];
  const state = emptyTrackerState();
  state.trackers.tfixed = { lastSearched: '2026-09-27', samples: {} };
  const plan = planTrackerSearches(trackers, state, { today: '2026-09-28', budget: 2 });
  assert.deepEqual(plan.map((q) => q.trackerId), ['tflexy', 'tfixed']);
  const all = planTrackerSearches(trackers, state, { today: '2026-09-28', budget: 10 });
  assert.equal(all.length, 3, 'fixed = 1/day, flex = 2/day, paused = 0');
  assert.equal(all[0].departDate, '2026-12-20');
  assert.equal(all[0].cabin, 'business');
  // Once the flex tracker has a best combo, it is re-checked first, then an unexplored one.
  state.trackers.tflexy = { samples: { '2026-12-21|2027-01-06': { p: 90000, at: '2026-09-27' }, '2026-12-20|2027-01-05': { p: 95000, at: '2026-09-27' } } };
  const flexPlan = planTrackerSearches([trackers[1]], state, { today: '2026-09-28', budget: 5 });
  assert.deepEqual(flexPlan.map((q) => `${q.departDate}|${q.returnDate}`), ['2026-12-21|2027-01-06', '2026-12-19|2027-01-04']);
});

const offer = (priceTWD, over = {}) => ({ priceTWD, primaryCarrier: 'CI', stops: 0, via: [], lieFlat: true, legs: [{ durationMin: 800, segments: [{ flightNumber: 'CI 1', carrier: 'CI' }] }], ...over });

test('alert sequence: start → drop → silent rise → cheaper dates → target → rise (alertOn any)', () => {
  const t = T({ id: 'tseq', flex: 1, target: 80000 });
  const state = emptyTrackerState();
  const q = (dep, ret) => ({ trackerId: 'tseq', departDate: dep, returnDate: ret, maxStops: null });
  const day = (today, results) => {
    for (const [dep, ret, price] of results) recordTrackerSample(state, q(dep, ret), price ? [offer(price)] : [], { today, insights: { level: 'typical', typicalRange: [90000, 120000] } });
    updateTrackerState(state, [t], today);
    return evaluateTrackerAlerts(state, [t], today).map((a) => a.kind);
  };
  assert.deepEqual(day('2026-10-01', [['2026-12-20', '2027-01-05', 100000]]), ['start']);
  assert.deepEqual(day('2026-10-02', [['2026-12-20', '2027-01-05', 99500]]), [], 'NT$500 is not significant');
  assert.deepEqual(day('2026-10-03', [['2026-12-20', '2027-01-05', 95000]]), ['drop']);
  assert.deepEqual(day('2026-10-04', [['2026-12-20', '2027-01-05', 101000]]), [], 'rise is silent with alertOn=drop');
  assert.deepEqual(day('2026-10-05', [['2026-12-20', '2027-01-05', 101000], ['2026-12-21', '2027-01-06', 92000]]), ['dates']);
  assert.deepEqual(day('2026-10-06', [['2026-12-21', '2027-01-06', 79000]]), ['target']);
  assert.deepEqual(day('2026-10-07', [['2026-12-21', '2027-01-06', 78800]]), [], 'still under target, tiny change');
  const st = state.trackers.tseq;
  assert.equal(st.low.p, 78800);
  assert.equal(st.first.p, 100000);
  assert.equal(st.history.length, 7);
  assert.equal(st.status, 'tracking');
  assert.equal(st.def.o, 'TPE');
  assert.equal(st.def.label, undefined, 'labels are private');

  const anyT = { ...t, alertOn: 'any' };
  recordTrackerSample(state, q('2026-12-21', '2027-01-06'), [offer(90000)], { today: '2026-10-08' });
  updateTrackerState(state, [anyT], '2026-10-08');
  assert.deepEqual(evaluateTrackerAlerts(state, [anyT], '2026-10-08').map((a) => a.kind), ['rise']);
});

test('maxStops filter, empty results, removed trackers kept for 14 days', () => {
  const t = T({ id: 'tstop', maxStops: 0 });
  const state = emptyTrackerState();
  const s = recordTrackerSample(state, { trackerId: 'tstop', departDate: '2026-12-20', returnDate: '2027-01-05', maxStops: 0 }, [offer(70000, { stops: 1 }), offer(88000)], { today: '2026-10-01' });
  assert.equal(s.p, 88000);
  assert.equal(recordTrackerSample(state, { trackerId: 'tnone', departDate: '2026-12-20', returnDate: null, maxStops: null }, [], { today: '2026-10-01' }), null);
  updateTrackerState(state, [t], '2026-10-01');
  assert.equal(state.trackers.tnone.status, 'removed');
  updateTrackerState(state, [t], '2026-10-20');
  assert.equal(state.trackers.tnone, undefined);
  assert.ok(bestSample(state.trackers.tstop.samples, '2026-10-01'));
  assert.equal(bestSample(state.trackers.tstop.samples, '2026-10-20'), null, 'stale samples are not "current"');
});

test('alert e-mail: localized subject/body, Google Flights link, labels shown only in private channels', () => {
  const t = T({ label: 'Paris NYE', target: 90000 });
  const a = { tracker: t, kind: 'drop', best: { p: 88000, dep: '2026-12-20', ret: '2027-01-05', c: 'CI', s: 0, key: '2026-12-20|2027-01-05', typ: [90000, 120000], lvl: 'low', fl: ['CI 923 · CI 71'] }, prev: { p: 95000, date: '2026-10-01' }, low: { p: 88000 }, isLow: true };
  const zh = formatTrackerAlert(a, 'zh-TW', 'https://app.example/');
  assert.match(zh.subject, /▼ 降價 NT\$7,000：TPE→CDG 現在 NT\$88,000 · Paris NYE/);
  assert.match(zh.text, /台北桃園 → 巴黎 · Paris NYE/);
  assert.match(zh.text, /追蹤以來最低價/);
  assert.match(zh.html, /google\.com\/travel\/flights/);
  assert.match(zh.html, /https:\/\/app\.example\/#routes/);
  const en = formatTrackerAlert({ ...a, kind: 'start', prev: null }, 'en');
  assert.match(en.subject, /^Now tracking TPE→CDG: lowest NT\$88,000/);
  assert.doesNotMatch(en.text, /Before:/);
  const ko = formatTrackerAlert({ ...a, kind: 'target' }, 'ko');
  assert.match(ko.subject, /목표가 도달/);
  assert.ok(!/<script/i.test(formatTrackerAlert({ ...a, tracker: { ...t, label: '<script>x</script>' } }, 'en').html));
});

test('sendTrackerAlerts: right people, right language, one failure does not stop the rest', async () => {
  const mails = [];
  const transport = { send: async (m) => { if (m.to === 'broken@x.com') throw new Error('boom'); mails.push(m); } };
  const pushes = [];
  const fetchImpl = async (url, init) => (pushes.push({ url, init }), new Response('', { status: 200 }));
  const env = { ALERT_EMAILS: 'sean=sean@x.com#zh-TW, blue=blue@x.com#en, carol=broken@x.com', NTFY_TOPICS: 'family=fam-topic@ko' };
  const best = { p: 88000, dep: '2026-12-20', ret: '2027-01-05', c: 'CI', s: 0 };
  const alerts = [
    { tracker: T({ id: 'tsean', notify: ['sean'] }), kind: 'drop', best, prev: { p: 95000 } },
    { tracker: T({ id: 'tall' }), kind: 'start', best, prev: null },
  ];
  const logs = [];
  const sent = await sendTrackerAlerts(alerts, { env, transport, fetchImpl, log: (m) => logs.push(m) });
  assert.deepEqual(mails.map((m) => m.to), ['sean@x.com', 'sean@x.com', 'blue@x.com']);
  assert.match(mails[2].subject, /Now tracking/);
  assert.ok(logs.some((l) => /carol/.test(l)));
  assert.equal(pushes.length, 2, 'shared family topic gets every alert');
  assert.match(pushes[0].url, /ntfy\.sh\/fam-topic$/);
  assert.ok(sent.includes('ntfy:family:200'));
});

async function sandbox() {
  const dir = await mkdtemp(path.join(tmpdir(), 'bct-trk-'));
  await mkdir(path.join(dir, 'config'), { recursive: true });
  await cp(path.join(ROOT, 'config', 'airport-countries.json'), path.join(dir, 'config', 'airport-countries.json'));
  const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config', 'routes.json')));
  await writeFile(path.join(dir, 'config', 'routes.json'), JSON.stringify({ ...cfg, watchTrips: [] }));
  return dir;
}

test('demo scan with TRACKERS: results published without private fields, alerts evaluated, economy stays out of deals', async () => {
  const root = await sandbox();
  const outDir = path.join(root, 'out');
  const TRACKERS = JSON.stringify([
    { id: 'tbiz', o: 'TPE', d: 'NRT', depart: '2026-11-10', return: '2026-11-15', flex: 1, label: 'Secret trip', notify: ['blue'] },
    { id: 'teco', o: 'TPE', d: 'BKK', depart: '2026-11-10', cabin: 'economy' },
    { id: 'tbad', o: 'TPE', d: 'HKG', depart: '2026-11-10' },
  ]);
  const env = { FARE_PROVIDER: 'demo', OFFLINE: '1', TRACKERS };
  const first = await runScan({ root, outDir, env, today: '2026-09-28', log: quiet });
  assert.deepEqual(first.trackerAlerts.map((a) => `${a.tracker.id}:${a.kind}`).sort(), ['tbiz:start', 'teco:start']);
  assert.deepEqual(first.trackerSent, [], 'demo data never sends alerts');
  const raw = await readFile(path.join(outDir, 'trackers.json'), 'utf8');
  assert.ok(!raw.includes('Secret trip') && !raw.includes('blue'), 'labels / names never published');
  const data = JSON.parse(raw);
  assert.equal(data.trackers.tbiz.status, 'tracking');
  assert.equal(data.trackers.tbiz.checked, 2);
  assert.equal(data.trackers.tbad, undefined);
  assert.ok(data.trackers.teco.best.p > 0);
  const deals = JSON.parse(await readFile(path.join(outDir, 'deals.json'), 'utf8'));
  assert.ok(deals.deals.some((d) => d.routeKey === 'TPE-NRT' && d.departDate === '2026-11-10'), 'business tracker results feed the deal list');
  assert.ok(!deals.deals.some((d) => d.routeKey === 'TPE-BKK' && d.departDate === '2026-11-10' && !d.returnDate), 'economy results do not');
  assert.ok(Array.isArray(deals.people));

  const second = await runScan({ root, outDir, env, today: '2026-09-29', log: quiet });
  const st = second.trackerState.trackers.tbiz;
  assert.equal(st.history.length, 2);
  assert.ok(st.checked >= 3, 'flexible window keeps being explored');
});

test('real provider + mail transport: tracker alerts are e-mailed', async () => {
  const root = await sandbox();
  const outDir = path.join(root, 'out');
  const serp = readFileSync(new URL('./fixtures/serpapi-tpe-cdg.json', import.meta.url), 'utf8');
  const posts = [];
  const searches = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    if (u.hostname === 'serpapi.com') {
      if (u.pathname === '/search.json') searches.push(u.searchParams);
      return new Response(serp);
    }
    if (u.hostname === 'api.resend.com') {
      posts.push(JSON.parse(init.body));
      return new Response('{"id":"x"}');
    }
    throw new Error('offline');
  };
  const env = {
    SERPAPI_KEY: 'k', SEARCHES_PER_RUN: '3', SCAN_DELAY_MS: '0',
    TRACKERS: JSON.stringify([{ id: 'tfirst', o: 'TPE', d: 'CDG', depart: '2026-12-20', return: '2027-01-05', cabin: 'first' }]),
    ALERT_EMAILS: 'sean=sean@x.com', RESEND_API_KEY: 're_test',
  };
  const { trackerSent } = await runScan({ root, outDir, env, fetchImpl, today: '2026-09-28', log: quiet });
  assert.equal(searches[0].get('outbound_date'), '2026-12-20', 'tracker searched first');
  assert.equal(searches[0].get('travel_class'), '4', 'first class');
  assert.deepEqual(trackerSent, ['mail:sean']);
  assert.equal(posts[0].to[0], 'sean@x.com');
  assert.match(posts[0].subject, /開始追蹤 TPE→CDG/);
});
