import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blankForm, formFromSearch, formFromTracker, switchTrip, addSeg, removeSeg, setSeg, bumpPax, addAirline, buildSearch, trackerFromForm,
  trackCost, searchCost, verifyCount, sortDeals, suggestTarget, paxTotal,
} from '../web/ui/search-model.js';
import { normalizeTracker } from '../web/core/trackers.js';

const TODAY = '2026-10-03';
const form = (over = {}) => blankForm(TODAY, over);

test('a blank form is a business-class round trip from Taipei, two months out', () => {
  const f = form();
  assert.deepEqual([f.trip, f.o, f.cabin, f.depart, f.return], ['rt', 'TPE', 'business', '2026-12-02', '2026-12-09']);
  assert.equal(f.track, false);
  assert.equal(paxTotal(f), 1);
});

test('buildSearch: places can be names in any language; errors name the field', () => {
  const ok = buildSearch(form({ o: '台北', d: 'Tokyo' }));
  assert.equal(ok.search.o, 'TPE');
  assert.equal(ok.search.d, 'NRT,HND');
  assert.equal(ok.search.trip, 'rt');
  assert.equal(ok.search.cabin, 'business');
  assert.deepEqual(buildSearch(form({ d: '' })), { error: 'airport', field: 'd' });
  assert.deepEqual(buildSearch(form({ d: 'Hong Kong' })), { error: 'blocked-airport', field: 'd' });
  assert.deepEqual(buildSearch(form({ d: 'HKG' })), { error: 'blocked-airport', field: 'd' });
  assert.deepEqual(buildSearch(form({ d: 'Europe' })), { error: 'area', field: 'd' });
  assert.deepEqual(buildSearch(form({ d: 'TPE' })), { error: 'same-airport', field: 'd' });
  assert.deepEqual(buildSearch(form({ d: 'CDG', depart: '' })), { error: 'depart', field: 'depart' });
  assert.deepEqual(buildSearch(form({ d: 'CDG', return: '2026-12-01' })), { error: 'return-before-depart', field: 'return' });
  assert.equal(buildSearch(form({ d: 'CDG', airlines: ['CA'] })).error, 'blocked-airline', 'Air China, even if it got into the list');
  const ow = buildSearch(form({ d: 'CDG', trip: 'ow', return: '' }));
  assert.equal(ow.search.trip, 'ow');
  assert.equal(ow.search.return, null);
});

test('filters flow through: alliance, airlines, stops, passengers, bags, duration', () => {
  const r = buildSearch(form({ d: 'CDG', alliance: 'SKYTEAM', airlines: ['BR'], maxStops: 0, adults: 2, children: 1, bags: 1, maxHours: '14' }));
  assert.deepEqual([r.search.alliance, r.search.airlines, r.search.maxStops, r.search.adults, r.search.children, r.search.bags, r.search.maxHours], ['SKYTEAM', ['BR'], 0, 2, 1, 1, 14]);
});

test('multi-city: legs from the form, errors point at the leg', () => {
  const f = switchTrip(form({ o: 'CRK', d: 'TPE', depart: '2026-11-01', return: '2026-11-08' }), 'mc');
  assert.equal(f.trip, 'mc');
  assert.deepEqual(f.segs.map((s) => [s.o, s.d, s.date]), [['CRK', 'TPE', '2026-11-01'], ['TPE', 'CRK', '2026-11-08']]);
  const three = setSeg(setSeg(addSeg(f), 1, 'd', 'FCO'), 2, 'd', 'TPE');
  assert.deepEqual(three.segs.map((s) => `${s.o}>${s.d}`), ['CRK>TPE', 'TPE>FCO', 'FCO>TPE']);
  assert.deepEqual(three.segs[2].date, '2026-11-12', 'a new leg starts four days after the last');
  const s = buildSearch(three).search;
  assert.equal(s.trip, 'mc');
  assert.deepEqual(s.segs.map((x) => x.d), ['TPE', 'FCO', 'TPE']);
  assert.deepEqual(buildSearch(setSeg(three, 1, 'd', '香港')), { error: 'blocked-airport', field: 'seg.1.d' });
  assert.deepEqual(buildSearch(setSeg(three, 1, 'o', '')), { error: 'airport', field: 'seg.1.o' });
  assert.equal(buildSearch(setSeg(three, 2, 'date', '2026-11-02')).error, 'segment-order');
});

test('addSeg / removeSeg: between 2 and 5 legs; "back home" closes the loop', () => {
  let f = switchTrip(form({ d: 'CDG' }), 'mc');
  assert.equal(f.segs.length, 2);
  assert.equal(removeSeg(f, 0).segs.length, 2, 'never fewer than two');
  f = addSeg(addSeg(addSeg(f)));
  assert.equal(f.segs.length, 5);
  assert.equal(addSeg(f).segs.length, 5, 'never more than five');
  assert.equal(removeSeg(f, 4).segs.length, 4);
  const loop = addSeg(form({ o: 'TPE', d: 'FCO', trip: 'mc', segs: [{ o: 'TPE', d: 'FCO', date: '2026-11-01' }, { o: 'FCO', d: 'CDG', date: '2026-11-05' }] }), { backHome: true });
  assert.deepEqual([loop.segs[2].o, loop.segs[2].d], ['CDG', 'TPE']);
});

test('switching trip type keeps what was typed, both ways', () => {
  const rt = form({ o: 'TPE', d: 'LAX', depart: '2026-12-01', return: '2026-12-10' });
  const mc = switchTrip(rt, 'mc');
  assert.deepEqual(mc.segs.map((s) => [s.o, s.d, s.date]), [['TPE', 'LAX', '2026-12-01'], ['LAX', 'TPE', '2026-12-10']]);
  const back = switchTrip(mc, 'rt');
  assert.deepEqual([back.o, back.d, back.depart, back.return], ['TPE', 'LAX', '2026-12-01', '2026-12-10']);
  const ow = switchTrip(rt, 'ow');
  assert.equal(ow.trip, 'ow');
  assert.equal(switchTrip(ow, 'rt').return > ow.depart, true, 'a return date is made up when there was none');
  const mcFromOw = switchTrip(ow, 'mc');
  assert.equal(mcFromOw.segs.length, 2);
  assert.equal(mcFromOw.segs[1].o, 'LAX');
});

test('formFromSearch / formFromTracker round-trip a multi-city search', () => {
  const { search } = buildSearch(setSeg(setSeg(addSeg(switchTrip(form({ o: 'CRK', d: 'TPE', depart: '2026-11-01', return: '2026-11-08' }), 'mc')), 1, 'd', 'FCO'), 2, 'd', 'TPE'));
  const f = formFromSearch(search, form());
  assert.equal(f.trip, 'mc');
  assert.deepEqual(buildSearch(f).search, search);
  const { tracker } = normalizeTracker({ ...search, id: 'tabc123', mode: 'flex', flex: 2, target: 20000, label: 'EY trick', pos: true });
  const g = formFromTracker(tracker, TODAY);
  assert.deepEqual([g.id, g.track, g.mode, g.flex, g.target, g.label, g.pos], ['tabc123', true, 'flex', 2, 20000, 'EY trick', true]);
  assert.deepEqual(buildSearch(g).search, search);
});

test('trackerFromForm: the tracker a search form describes', () => {
  const f = form({ d: 'CDG', depart: '2026-12-01', return: '2026-12-10', track: true, mode: 'flex', flex: 3, target: '95000', alertOn: 'any', label: 'Paris', pos: true, alliance: 'SKYTEAM', adults: 2 });
  const { tracker, error } = trackerFromForm(f, { today: TODAY });
  assert.equal(error, undefined);
  assert.deepEqual([tracker.o, tracker.d, tracker.mode, tracker.flex, tracker.target, tracker.alertOn, tracker.label, tracker.pos, tracker.alliance, tracker.adults],
    ['TPE', 'CDG', 'flex', 3, 95000, 'any', 'Paris', true, 'SKYTEAM', 2]);
  assert.match(tracker.id, /^t[a-z0-9]+$/);
  assert.equal(trackerFromForm(f, { today: TODAY, id: 'tkeep1' }).tracker.id, 'tkeep1');
  assert.equal(trackerFromForm(form({ d: 'CDG', depart: '2026-10-01', return: '2026-10-09' }), { today: TODAY }).error, 'past', 'dates in the past are refused at the form');
  assert.deepEqual(buildSearch(form({ d: 'CDG', depart: '2026-10-01', return: '2026-10-09' }), { today: TODAY }), { error: 'past', field: 'depart' });
  assert.equal(trackerFromForm(form({ d: 'CDG', depart: '2026-10-03', return: '2026-10-09' }), { today: TODAY }).error, 'past', 'today is too late to search for tomorrow');
  assert.equal(trackerFromForm(form({ d: '香港' }), { today: TODAY }).error, 'blocked-airport');
  const fixed = trackerFromForm({ ...f, mode: 'fixed' }, { today: TODAY }).tracker;
  assert.deepEqual([fixed.mode, fixed.flex], ['fixed', 0]);
});

test('trackCost: searches a day, one more with country checks; flexible dates take days to cover', () => {
  assert.deepEqual(trackCost(form()), { perDay: 1, combos: 1, days: 1 });
  assert.deepEqual(trackCost(form({ mode: 'flex', flex: 3, pos: true })), { perDay: 3, combos: 49, days: 48 });
  assert.equal(trackCost(form({ trip: 'mc', mode: 'flex', flex: 2 })).combos, 5, 'multi-city dates move together');
  assert.equal(trackCost(form({ trip: 'ow', mode: 'flex', flex: 2 })).combos, 5);
});

test('search cost: legs after the first are only searched for the options that get verified', () => {
  assert.equal(searchCost(1, 2), 1);
  assert.equal(searchCost(2, 2), 3);
  assert.equal(searchCost(3, 2), 5);
  for (let legs = 1; legs <= 5; legs++) assert.ok(searchCost(legs, verifyCount(legs)) <= 5, `legs ${legs}`);
  assert.deepEqual([1, 2, 3, 4, 5].map(verifyCount), [0, 2, 2, 1, 1]);
});

test('airlines: by code or name, never a blocked carrier', () => {
  assert.deepEqual(addAirline([], 'ci'), { airlines: ['CI'] });
  assert.deepEqual(addAirline([], 'EVA Air'), { airlines: ['BR'] });
  assert.deepEqual(addAirline([], '長榮航空'), { airlines: ['BR'] });
  assert.deepEqual(addAirline(['CI'], 'China Airlines'), { error: 'dup' }, 'China Airlines is Taiwanese and allowed — it is just already there');
  assert.equal(addAirline([], 'CA').error, 'blocked', 'Air China');
  assert.equal(addAirline([], 'China Southern').error, 'blocked');
  assert.equal(addAirline([], 'Cathay Pacific').error, 'blocked');
  for (const name of ['國泰', '國泰航空', '港龍', '海南航空', '中國國際航空', '东方航空', '캐세이퍼시픽']) assert.equal(addAirline([], name).error, 'blocked', name);
  assert.deepEqual(addAirline([], '中華航空'), { airlines: ['CI'] }, 'China Airlines (Taiwan) stays allowed');
  assert.deepEqual(addAirline([], '聯合航空'), { airlines: ['UA'] }, 'United Airlines');
  assert.equal(addAirline([], 'zzzz').error, 'unknown');
  assert.equal(addAirline(['CI', 'BR', 'JX', 'SQ', 'NH', 'KE', 'DL', 'AF'], 'LH').error, 'full');
  assert.deepEqual(addAirline(['CI'], ''), { airlines: ['CI'] });
});

test('passengers stay within nine seats and one lap infant per adult', () => {
  let f = form();
  f = bumpPax(f, 'adults', 2);
  assert.equal(f.adults, 3);
  f = bumpPax(f, 'infantsLap', 5);
  assert.equal(f.infantsLap, 3, 'one lap infant per adult');
  f = bumpPax(f, 'adults', -1);
  assert.deepEqual([f.adults, f.infantsLap], [2, 2], 'removing an adult takes a lap infant with them');
  assert.equal(bumpPax(f, 'adults', -5).adults, 1, 'at least one adult');
  f = bumpPax(f, 'children', 20);
  assert.equal(f.adults + f.children + f.infantsSeat, 9);
});

test('result sorting and the default target price', () => {
  const mk = (id, priceTWD, stops, dur, dep) => ({ id, priceTWD, stops, legs: [{ durationMin: dur, segments: [{ dep }] }] });
  const list = [mk('a', 90000, 1, 900, '2026-12-01 23:00'), mk('b', 100000, 0, 700, '2026-12-01 09:00'), mk('c', 80000, 2, 1300, '2026-12-01 14:00')];
  assert.deepEqual(sortDeals(list, 'price').map((d) => d.id), ['c', 'a', 'b']);
  assert.deepEqual(sortDeals(list, 'duration').map((d) => d.id), ['b', 'a', 'c']);
  assert.deepEqual(sortDeals(list, 'stops').map((d) => d.id), ['b', 'a', 'c']);
  assert.deepEqual(sortDeals(list, 'depart').map((d) => d.id), ['b', 'c', 'a']);
  assert.equal(suggestTarget(141615), 134500);
  assert.equal(suggestTarget(500), 1000);
});

test('every error the form can report has a message in every language', async () => {
  globalThis.document ??= { documentElement: {} };
  const { STRINGS } = await import('../web/i18n.js');
  const codes = ['airport', 'area', 'same-airport', 'blocked-airport', 'too-many', 'depart', 'return', 'return-before-depart', 'past', 'segments', 'segment-order', 'blocked-airline', 'not-an-object', 'form'];
  // and the ones the model really produces for assorted bad forms
  const seen = new Set();
  const bad = [
    { d: '' }, { d: 'Europe' }, { d: 'TPE' }, { d: 'HKG' }, { d: 'JFK EWR LGA BOS LAX' }, { d: 'CDG', depart: '' }, { d: 'CDG', return: '' }, { d: 'CDG', return: '2026-01-01' },
    { d: 'CDG', depart: '2020-01-01', return: '2020-01-09' }, { d: 'CDG', airlines: ['CA'] },
  ];
  for (const over of bad) {
    const r = trackerFromForm(form({ ...over }), { today: TODAY });
    if (r.error) seen.add(r.error);
  }
  const mc = switchTrip(form({ d: 'CDG' }), 'mc');
  for (const f of [setSeg(mc, 1, 'date', '2026-01-01'), { ...mc, segs: [mc.segs[0]] }]) {
    const r = buildSearch(f, { today: TODAY });
    if (r.error) seen.add(r.error);
  }
  for (const c of [...codes, ...seen]) for (const lang of Object.keys(STRINGS)) assert.ok(STRINGS[lang][`sErr_${c}`], `${lang}: sErr_${c}`);
});
