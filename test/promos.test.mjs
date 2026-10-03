import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeed } from '../scripts/lib/rss.mjs';
import {
  classifyPromo, parseValidTo, detectLocks, usableFromTaiwan, brandsIn, detectPromoKinds, relatedToWallet, promoRelevance,
} from '../web/core/promos.js';
import { PROGRAMS, programKind, programAlliance, earningMemberships } from '../web/core/programs.js';

const feed = (name) => parseFeed(readFileSync(new URL(`./fixtures/feeds/${name}.xml`, import.meta.url), 'utf8'));
const TODAY = '2026-10-03';
const promo = (raw, source = {}) => classifyPromo({ id: 'p', url: 'https://example.com/p', published: '2026-10-03T08:00:00Z', summary: '', categories: [], ...raw }, { today: TODAY, source });
const find = (name, re) => feed(name).items.find((i) => re.test(i.title));

test('hotel and car programs live in the wallet table without a carrier', () => {
  assert.equal(PROGRAMS.MARRIOTT.carrier, null);
  assert.equal(programKind('MARRIOTT'), 'hotel');
  assert.equal(programKind('HERTZ'), 'car');
  assert.equal(programKind('DL'), 'airline');
  assert.equal(programKind('OTHER'), 'other');
  assert.equal(programAlliance('HILTON'), 'NONE');
  assert.equal(programAlliance('DL'), 'SKYTEAM');
  // a hotel membership never "earns" on a flight
  const members = [{ program: 'HILTON' }, { program: 'DL' }];
  assert.deepEqual(earningMemberships(members, 'DL', 'SKYTEAM').map((x) => x.m.program), ['DL']);
});

test('brandsIn: airlines, hotels, cruise lines — in the order the title mentions them', () => {
  const ids = (t) => brandsIn(t).map((b) => `${b.kind}:${b.id}`);
  assert.deepEqual(ids('Marriott Bonvoy and Delta SkyMiles and Hilton Honors'), ['hotel:MARRIOTT', 'airline:DL', 'hotel:HILTON']);
  assert.deepEqual(ids('Korean Air SKYPASS 50% bonus'), ['airline:KE']);
  assert.deepEqual(ids('Flying Blue promo rewards'), ['airline:AFKL']);
  assert.deepEqual(ids('Explora Journeys status match'), ['cruise:CRUISE']);
  assert.deepEqual(ids('萬豪 與 華航 聯名'), ['hotel:MARRIOTT', 'airline:CI']);
  assert.deepEqual(ids('nothing here'), []);
  assert.equal(brandsIn('World of Hyatt')[0].program, 'HYATT');
  assert.equal(brandsIn('Alaska Airlines Atmos Rewards')[0].carrier, 'AS');
});

test('parseValidTo: the ways promotions announce their deadline', () => {
  const d = (t, pub = TODAY) => parseValidTo(t, `${pub}T08:00:00Z`);
  assert.equal(d('ENDS TUESDAY: Huge 60,000 Avios bonus'), '2026-10-06');
  assert.equal(d('Capital One x JAL (ENDS TONIGHT)'), TODAY);
  assert.equal(d('valid through October 31'), '2026-10-31');
  assert.equal(d('ends on Nov 3rd'), '2026-11-03');
  assert.equal(d('offer ends 15 November'), '2026-11-15');
  assert.equal(d('[Extended 1/15/27] OnePay'), '2027-01-15');
  assert.equal(d('expires 12/31'), '2026-12-31');
  assert.equal(d('until 2026-12-31'), '2026-12-31');
  assert.equal(d('valid from Oct 1 to Nov 15'), '2026-11-15');
  assert.equal(d('between 1 October and 15 November 2026'), '2026-11-15');
  assert.equal(d('through January 5', '2026-12-20'), '2027-01-05', 'a date that has already passed this year means next year');
  assert.equal(d('10月31日止'), '2026-10-31');
  assert.equal(d('至11月30日'), '2026-11-30');
  assert.equal(d('Join anytime, no deadline'), null);
  assert.equal(d('starting October 1'), null, 'a start date is not a deadline');
});

test('detectLocks: who can use it', () => {
  assert.deepEqual(detectLocks('[Washington State] Delta 12status: Free Delta Miles'), ['US']);
  assert.deepEqual(detectLocks('US residents only'), ['US']);
  assert.deepEqual(detectLocks('[Targeted] offer'), ['TARGETED']);
  assert.deepEqual(detectLocks('open to all members worldwide'), []);
  assert.equal(usableFromTaiwan([]), true);
  assert.equal(usableFromTaiwan(['TARGETED']), true, 'maybe — still worth a look');
  assert.equal(usableFromTaiwan(['US']), false);
});

test('detectPromoKinds', () => {
  const k = (t, c) => detectPromoKinds(t, c);
  assert.ok(k('Marriott & JAL Announce Partnership & Status Match').includes('status-match'));
  assert.ok(k('Fast track to gold status').includes('status-match'));
  assert.ok(k('Hotel offer', ['Status Match']).includes('status-match'));
  assert.ok(k('Get up to a 35% bonus on points transfers to Avios').includes('bonus-miles'));
  assert.ok(k('Buy Alaska Atmos Rewards Points With 100% Bonus').includes('bonus-miles'));
  assert.ok(k('Flying Blue promo rewards - Oct 2026').includes('award-sale'));
  assert.ok(k('EVA Air flash sale: Taipei to Tokyo from NT$5,990').includes('fare-sale'));
  assert.ok(k('Starlux inaugural flights to Phoenix').includes('route-promo'));
  assert.ok(k('華航 8折優惠').includes('fare-sale'));
  assert.deepEqual(k('Lounge review: a day in Doha'), []);
});

test('classifyPromo: real posts from Travel-Dealz, Head for Points, Reddit, Doctor of Credit', () => {
  const cruise = promo(find('travel-dealz', /Explora/), { id: 'travel-dealz' });
  assert.deepEqual([cruise.item.kinds, cruise.item.category, cruise.item.brands[0].id], [['status-match'], 'cruise', 'CRUISE']);

  const avios = promo(find('headforpoints', /35% bonus/));
  assert.ok(avios.item.kinds.includes('bonus-miles'));
  assert.deepEqual(avios.item.brands.map((b) => b.carrier).sort(), ['BA', 'QR']);

  const fb = promo(find('reddit-awardtravel', /Flying Blue/));
  assert.equal(fb.item.validTo, '2026-10-31', 'a promo named for a month runs to its end');
  assert.deepEqual(fb.item.kinds, ['award-sale']);

  const marriott = promo(find('headforpoints', /Marriott/));
  assert.equal(marriott.item.category, 'hotel');

  const atmos = promo(find('travel-dealz', /Atmos/));
  assert.equal(atmos.item.brands[0].carrier, 'AS');

  // not promotions
  assert.equal(promo(find('headforpoints', /60,000 Avios/)).drop, 'card', 'a credit-card sign-up bonus is a bank product, not an airline promotion');
  assert.equal(promo(find('milelion', /StanChart/)).drop, 'no-brand');
  assert.equal(promo(find('reddit-awardtravel', /never have/)).drop, 'not-promo', 'a forum question');
  assert.equal(promo({ title: '[Expired] Bilt Rent Day: ALL Accor Status Match' }).drop, 'expired');
  assert.equal(promo({ title: 'Delta Medallion status match', summary: 'Offer ends September 15.' }).drop, 'expired', 'deadline already passed');
  assert.equal(promo({ title: 'Cathay Pacific status match to Marco Polo Club' }).drop, 'china');
  assert.equal(promo({ title: 'Hotel status match', summary: 'Works with Hong Kong properties only' }).drop, 'china');
  assert.equal(promo({ title: 'Delta SkyMiles sale', published: '2026-08-01T00:00:00Z' }).drop, 'stale');
  assert.notEqual(promo({ title: 'Marriott status match to Hilton', published: '2026-08-01T00:00:00Z' }).drop, 'stale', 'a status match stays useful for months');
});

test('promoRelevance: status matches and Taiwan rank above plain bonuses; a lock to another country sinks', () => {
  const base = { kinds: ['bonus-miles'], brands: [{ id: 'QR', kind: 'airline', carrier: 'QR' }], lock: [], mentionsTaiwan: false, published: '2026-10-03T08:00:00Z' };
  const r = (over) => promoRelevance({ ...base, ...over }, { today: TODAY });
  assert.ok(r({ kinds: ['status-match'] }) > r({}));
  assert.ok(r({ mentionsTaiwan: true }) > r({}));
  assert.ok(r({ lock: ['US'] }) < r({}) - 15);
  assert.ok(r({ brands: [{ id: 'DL', kind: 'airline', carrier: 'DL' }] }) > r({}), 'SkyTeam first');
  assert.ok(r({ published: '2026-09-10T00:00:00Z' }) < r({}));
});

test('relatedToWallet: a promo about a program you hold (or its airline) is flagged', () => {
  const item = { brands: [{ id: 'DL', kind: 'airline', program: 'DL', carrier: 'DL' }, { id: 'HILTON', kind: 'hotel', program: 'HILTON', carrier: null }] };
  assert.deepEqual(relatedToWallet(item, [{ program: 'DL' }]).map((b) => b.id), ['DL']);
  assert.deepEqual(relatedToWallet(item, [{ program: 'HILTON' }]).map((b) => b.id), ['HILTON']);
  assert.deepEqual(relatedToWallet(item, [{ program: 'AFKL' }]), []);
  assert.deepEqual(relatedToWallet(item, []), []);
});
