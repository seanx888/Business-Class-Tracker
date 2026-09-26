import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubscribers, formatDigest, formatAlert, sendNotifications } from '../scripts/notify.mjs';
import { evaluatePriceAlerts } from '../scripts/scan.mjs';

const deal = (over = {}) => ({
  id: 'd1', routeKey: 'TPE-CDG', origin: 'TPE', destination: 'CDG', priceTWD: 98500, discountPct: 30, tier: 'hot',
  primaryCarrier: 'CI', stops: 0, departDate: '2026-11-10', returnDate: '2026-11-24', lastSeen: '2026-09-26', ...over,
});

test('parseSubscribers: names, languages, defaults, invalid topics dropped', () => {
  assert.deepEqual(parseSubscribers('sean=bct-sean-7Hq2@zh-TW, blue=bct-blue-Lm4v@en'), [
    { name: 'sean', topic: 'bct-sean-7Hq2', lang: 'zh-TW' },
    { name: 'blue', topic: 'bct-blue-Lm4v', lang: 'en' },
  ]);
  assert.deepEqual(parseSubscribers('only-topic'), [{ name: 'subscriber1', topic: 'only-topic', lang: 'zh-TW' }]);
  assert.equal(parseSubscribers('Sean=abc@ko')[0].name, 'sean');
  assert.equal(parseSubscribers('x=abc@ko')[0].lang, 'ko');
  assert.equal(parseSubscribers('bad topic!,https://evil/x').length, 0);
  assert.deepEqual(parseSubscribers(''), []);
});

test('digest is localized per person', () => {
  const zh = formatDigest([deal()], 'https://x/', 'zh-TW');
  assert.match(zh, /商務艙好價 \(1\)/);
  assert.match(zh, /巴黎/);
  assert.match(zh, /中華航空 · 直飛/);
  const en = formatDigest([deal()], null, 'en');
  assert.match(en, /Business class deals \(1\)/);
  assert.match(en, /Paris NT\$98,500 ▼30%/);
  assert.match(en, /China Airlines · nonstop/);
  const ko = formatDigest([deal({ stops: 1 })], null, 'ko');
  assert.match(ko, /비즈니스석 특가/);
  assert.match(ko, /파리/);
  assert.match(ko, /1회 경유/);
  assert.match(formatAlert([{ deal: deal(), maxTWD: 110000 }], 'en'), /target NT\$110,000/);
});

test('sendNotifications: digest to everyone, personal alerts only to that person, UTF-8 titles, token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init });
    return new Response('ok', { status: 200 });
  };
  const env = { NTFY_TOPICS: 'sean=topic-sean@zh-TW,blue=topic-blue@en', NTFY_TOKEN: 'tk_abc' };
  const alerts = new Map([['blue', [{ deal: deal(), maxTWD: 110000 }]]]);
  const sent = await sendNotifications([deal()], alerts, { env, siteUrl: 'https://s/', fetchImpl });
  assert.deepEqual(sent, ['sean:200', 'blue:200', 'blue:200']);
  const toSean = calls.filter((c) => c.url.endsWith('/topic-sean'));
  const toBlue = calls.filter((c) => c.url.endsWith('/topic-blue'));
  assert.equal(toSean.length, 1, 'Sean gets only the digest');
  assert.equal(toBlue.length, 2, 'Blue gets the personal alert + the digest');
  assert.match(toSean[0].body, /中華航空/);
  assert.match(toBlue[1].body, /China Airlines/);
  const decode = (h) => Buffer.from(/=\?UTF-8\?B\?(.*)\?=/.exec(h)[1], 'base64').toString('utf8');
  assert.equal(decode(toSean[0].headers.Title), '商務艙好價');
  assert.equal(decode(toBlue[0].headers.Title), 'Price target hit');
  assert.equal(toBlue[0].headers.Priority, 'high');
  assert.equal(toSean[0].headers.Click, 'https://s/');
  assert.equal(decode(toSean[0].headers.Actions), 'view, 開啟 App, https://s/');
  assert.equal(toSean[0].headers.Authorization, 'Bearer tk_abc');
  assert.ok(calls.every((c) => c.url.startsWith('https://ntfy.sh/')));
});

test('sendNotifications: nothing configured → nothing sent; custom server honoured', async () => {
  assert.deepEqual(await sendNotifications([deal()], new Map(), { env: {}, fetchImpl: async () => { throw new Error('should not call'); } }), []);
  const urls = [];
  await sendNotifications([deal()], new Map(), { env: { NTFY_TOPICS: 'a', NTFY_SERVER: 'https://ntfy.example.com/' }, fetchImpl: async (u) => (urls.push(u), new Response('')) });
  assert.deepEqual(urls, ['https://ntfy.example.com/a']);
});

test('price alerts: fire once, again only when cheaper or after 7 days', () => {
  const history = {};
  const alerts = [{ who: 'Blue', route: 'tpe-cdg', maxTWD: 110000 }, { who: ['sean', 'blue'], route: 'TPE-NRT', maxTWD: 20000 }];
  let hits = evaluatePriceAlerts(alerts, [deal()], history, '2026-09-26');
  assert.deepEqual([...hits.keys()], ['blue']);
  assert.equal(hits.get('blue')[0].deal.priceTWD, 98500);

  hits = evaluatePriceAlerts(alerts, [deal({ lastSeen: '2026-09-27' })], history, '2026-09-27');
  assert.equal(hits.size, 0, 'same price next day → no repeat');

  hits = evaluatePriceAlerts(alerts, [deal({ id: 'd2', priceTWD: 95000, lastSeen: '2026-09-28' })], history, '2026-09-28');
  assert.equal(hits.get('blue')[0].deal.priceTWD, 95000, 'cheaper → alert again');

  hits = evaluatePriceAlerts(alerts, [deal({ id: 'd3', priceTWD: 99000, lastSeen: '2026-10-06' })], history, '2026-10-06');
  assert.equal(hits.size, 1, 'still under target after 7 days → reminder');

  hits = evaluatePriceAlerts(alerts, [deal({ priceTWD: 120000, lastSeen: '2026-10-20' })], history, '2026-10-20');
  assert.equal(hits.size, 0, 'above target → nothing');
  hits = evaluatePriceAlerts(alerts, [deal({ lastSeen: '2026-09-01' })], {}, '2026-10-20');
  assert.equal(hits.size, 0, 'stale (not seen today) deals never alert');
});

test('price alerts: invalid entries ignored', () => {
  const hits = evaluatePriceAlerts([{ who: 'x', route: 'nope', maxTWD: 1 }, { route: 'TPE-CDG' }, null], [deal()], {}, '2026-09-26');
  assert.equal(hits.size, 0);
});
