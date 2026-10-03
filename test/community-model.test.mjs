import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePost } from '../web/core/community.js';
import { normalizeSearch } from '../web/core/search.js';
import {
  chinaFree, filterDeals, filterPromos, kindCounts, deadline, dealSearchFields, routeFields, readMarks, writeMarks, pickAlerts, pickExpiring, MIN_RELEVANCE, daysUntil,
} from '../web/ui/community-model.js';

const TODAY = '2026-10-03';
const none = () => ({ saved: new Set(), hidden: new Set() });
const deal = (over) => ({ id: 'd', title: 'Fare', summary: '', kinds: ['sale'], relevance: 50, published: '2026-10-03T00:00:00Z', cabin: null, route: { o: null, d: null }, ...over });
const promo = (over) => ({ id: 'p', title: 'Promo', summary: '', kinds: ['status-match'], category: 'hotel', relevance: 60, published: '2026-10-03T00:00:00Z', brands: [], lock: [], validTo: null, ...over });

const FEED = JSON.parse(readFileSync(new URL('./fixtures/community-sample.json', import.meta.url), 'utf8'));

test('filterDeals: relevance floor, kind, hidden and saved; best first', () => {
  const list = [deal({ id: 'a', relevance: 80, kinds: ['error-fare'] }), deal({ id: 'b', relevance: 20 }), deal({ id: 'c', relevance: 60, kinds: ['ex-station', 'multi-city'] }), deal({ id: 'd', relevance: 45 })];
  const ids = (f, marks = none()) => filterDeals(list, { rel: 'mine', kind: 'all', ...f }, marks).map((x) => x.id);
  assert.deepEqual(ids({}), ['a', 'c', 'd'], 'b is below the floor');
  assert.equal(MIN_RELEVANCE, 35);
  assert.deepEqual(ids({ rel: 'all' }), ['a', 'c', 'd', 'b']);
  assert.deepEqual(ids({ kind: 'multi-city' }), ['c']);
  assert.deepEqual(ids({}, { saved: new Set(), hidden: new Set(['a']) }), ['c', 'd']);
  assert.deepEqual(ids({ rel: 'saved' }, { saved: new Set(['b']), hidden: new Set() }), ['b'], 'saved posts show regardless of relevance');
  assert.deepEqual(kindCounts(list), { 'error-fare': 1, 'ex-station': 1, 'multi-city': 1, interline: 0, stopover: 0, 'hidden-city': 0, sale: 2 });
});

test('chinaFree re-checks what the browser received', () => {
  const r = chinaFree([deal({ id: 'x', title: 'Cathay Pacific business class sale' }), deal({ id: 'y', summary: 'via Shanghai Pudong' }), deal({ id: 'z', title: 'Taipei to Tokyo on China Airlines' })]);
  assert.deepEqual(r.clean.map((x) => x.id), ['z']);
  assert.equal(r.dropped, 2);
});

test('filterPromos: your programs first, expired and locked-elsewhere hidden by default', () => {
  const members = [{ program: 'HILTON' }];
  const list = [
    promo({ id: 'm', brands: [{ id: 'MARRIOTT', kind: 'hotel', program: 'MARRIOTT', carrier: null }], relevance: 70 }),
    promo({ id: 'h', brands: [{ id: 'HILTON', kind: 'hotel', program: 'HILTON', carrier: null }], relevance: 55 }),
    promo({ id: 'us', brands: [{ id: 'DL', kind: 'airline', program: 'DL', carrier: 'DL' }], category: 'airline', lock: ['US'], relevance: 80 }),
    promo({ id: 'old', validTo: '2026-10-01', relevance: 90 }),
    promo({ id: 'low', relevance: 30 }),
    promo({ id: 'sale', kinds: ['fare-sale'], category: 'airline', relevance: 50 }),
  ];
  const ids = (f) => filterPromos(list, { rel: 'mine', kind: 'all', cat: 'all', ...f }, { members, today: TODAY }).map((x) => x.p.id);
  assert.deepEqual(ids({}), ['h', 'm', 'sale'], 'Hilton is yours (+30); US-only, expired and low relevance are out');
  assert.deepEqual(ids({ rel: 'all' }), ['h', 'us', 'm', 'sale', 'low'], 'expired is never shown; everything else with "all"');
  assert.deepEqual(ids({ rel: 'wallet' }), ['h']);
  assert.deepEqual(ids({ kind: 'fare-sale' }), ['sale']);
  assert.deepEqual(ids({ cat: 'airline', rel: 'all' }), ['us', 'sale']);
  assert.deepEqual(filterPromos(list, { rel: 'saved', kind: 'all', cat: 'all' }, { members, today: TODAY, saved: new Set(['low']) }).map((x) => x.p.id), ['low']);
});

test('deadline: days left and how urgent', () => {
  assert.equal(deadline(promo({}), TODAY), null);
  assert.deepEqual(deadline(promo({ validTo: '2026-10-03' }), TODAY), { days: 0, date: '2026-10-03', tone: 'urgent' });
  assert.equal(deadline(promo({ validTo: '2026-10-10' }), TODAY).tone, 'soon');
  assert.equal(deadline(promo({ validTo: '2026-12-31' }), TODAY).tone, 'plenty');
  assert.equal(deadline(promo({ validTo: '2026-10-01' }), TODAY), null, 'already over');
  assert.equal(daysUntil('2026-10-31', TODAY), 28);
});

test('dealSearchFields: a feed deal becomes a search when it names airports', () => {
  assert.deepEqual(dealSearchFields(deal({ route: { o: { kind: 'place', code: 'ICN' }, d: { kind: 'place', code: 'FCO' } }, cabin: 'business', price: { rt: true } })), { trip: 'rt', o: 'ICN', d: 'FCO', cabin: 'business' });
  assert.deepEqual(dealSearchFields(deal({ route: { o: { kind: 'country', code: 'DE' }, d: { kind: 'place', code: 'TPE' } }, price: { rt: false } })), { trip: 'ow', o: '', d: 'TPE', cabin: 'business' });
  assert.equal(dealSearchFields(deal({ route: { o: { kind: 'region', code: 'EU' }, d: null } })), null);
  assert.equal(dealSearchFields(deal({ route: { o: { kind: 'place', code: 'TPE' }, d: { kind: 'place', code: 'LAX' } }, cabin: 'economy' })).cabin, 'business', 'we look for business class even when the deal is economy');
});

test('the Etihad Facebook post: each example becomes a multi-city search; country / region stops wait for an airport', () => {
  const post = FEED.post;
  const r = parsePost(post);
  assert.equal(r.ok, true);
  const [fig1, fig2, fig3, ph1, ph2] = r.routes;
  const f1 = routeFields(fig1, {}, { today: TODAY });
  assert.deepEqual(f1.missing, []);
  assert.equal(f1.fields.trip, 'mc');
  assert.deepEqual(f1.fields.segs.map((s) => `${s.o}>${s.d}`), ['CRK>TPE', 'TPE>NYC', 'NYC>HKT']);
  assert.equal(f1.fields.segs[0].date, '2026-12-02');
  const ok = normalizeSearch({ trip: 'mc', segs: f1.fields.segs.map((s) => ({ ...s, o: s.o, d: s.d })) });
  assert.ok(ok.search, ok.error);
  assert.deepEqual(routeFields(fig2, {}, { today: TODAY }).fields.segs.map((s) => `${s.o}>${s.d}`), ['CRK>TPE', 'TPE>ROM', 'ROM>TPE']);
  assert.deepEqual(routeFields(fig3, {}, { today: TODAY }).fields.segs.map((s) => `${s.o}>${s.d}`), ['CRK>TPE', 'TPE>MIL', 'KEF>SIN'], 'Milan → Iceland is a gap you cover yourself: an open-jaw, not a flight');
  // 「菲律賓-台北-歐洲-台北-沖繩」: the Philippines and Europe are not airports yet
  const w = routeFields(ph1, {}, { today: TODAY });
  assert.deepEqual(w.missing.length, 2);
  const picked = routeFields(ph1, { [w.missing[0]]: 'CRK', [w.missing[1]]: 'FCO' }, { today: TODAY });
  assert.deepEqual(picked.missing, []);
  assert.deepEqual(picked.fields.segs.map((s) => `${s.o}>${s.d}`).slice(0, 3), ['CRK>TPE', 'TPE>FCO', 'FCO>TPE']);
});

test('readMarks / writeMarks survive bad storage', () => {
  assert.deepEqual([...readMarks(null).saved], []);
  assert.deepEqual([...readMarks('{oops').hidden], []);
  const m = readMarks(writeMarks({ saved: new Set(['a']), hidden: new Set(['b', 'c']) }));
  assert.deepEqual([[...m.saved], [...m.hidden]], [['a'], ['b', 'c']]);
});

test('pickAlerts: only NEW and strong items interrupt, once each; your own programs always count', () => {
  const data = {
    scanDate: TODAY,
    deals: [
      deal({ id: 'hot', relevance: 70, firstSeen: TODAY }),
      deal({ id: 'err', relevance: 48, kinds: ['error-fare'], firstSeen: TODAY }),
      deal({ id: 'meh', relevance: 40, firstSeen: TODAY }),
      deal({ id: 'old', relevance: 90, firstSeen: '2026-10-01' }),
    ],
    promos: [
      promo({ id: 'sm', kinds: ['status-match'], relevance: 46, firstSeen: TODAY }),
      promo({ id: 'weak', relevance: 40, firstSeen: TODAY }),
      promo({ id: 'us', relevance: 80, lock: ['US'], firstSeen: TODAY }),
      promo({ id: 'hil', relevance: 30, brands: [{ id: 'HILTON', kind: 'hotel', program: 'HILTON', carrier: null }], firstSeen: TODAY }),
    ],
  };
  const a = pickAlerts(data, { members: [{ program: 'HILTON' }] });
  assert.deepEqual(a.deals.map((x) => x.id), ['hot', 'err']);
  assert.deepEqual(a.promos.map((x) => x.id), ['sm']);
  assert.deepEqual(a.mine.map((x) => x.id), ['hil'], 'a promotion for a program you hold is worth a tap even when it is not strong');
  const again = pickAlerts(data, { members: [{ program: 'HILTON' }], seen: new Set(['hot', 'sm', 'hil']) });
  assert.deepEqual([again.deals.map((x) => x.id), again.promos, again.mine], [['err'], [], []]);
  assert.deepEqual(pickAlerts({ missing: true }), { deals: [], promos: [], mine: [] });
  assert.deepEqual(pickAlerts(null).deals, []);
  assert.deepEqual(pickAlerts(data, { hidden: new Set(['hot', 'err']) }).deals, []);
});

test('pickExpiring: a saved promotion about to end is mentioned once', () => {
  const data = { promos: [promo({ id: 'a', validTo: '2026-10-05' }), promo({ id: 'b', validTo: '2026-10-20' }), promo({ id: 'c', validTo: '2026-10-04' }), promo({ id: 'd', validTo: '2026-10-01' })] };
  const saved = new Set(['a', 'b', 'd']);
  assert.deepEqual(pickExpiring(data, { saved, today: TODAY }).map((p) => p.id), ['a'], 'b is far off, c is not saved, d is over');
  assert.deepEqual(pickExpiring(data, { saved, today: TODAY, seen: new Set(['exp:a']) }), []);
  assert.deepEqual(pickExpiring({ missing: true }, { saved, today: TODAY }), []);
});
