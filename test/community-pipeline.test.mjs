import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSource, triage, dedupeDeals, runCommunity, itemId } from '../scripts/lib/community.mjs';
import { main as runCli, offlineFetch } from '../scripts/community.mjs';
import { defaultPick, personalPick, parsePromoAlerts, formatDigest, sendCommunityDigest } from '../scripts/community-notify.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const quiet = () => {};
const FIXTURES = path.join(ROOT, 'test', 'fixtures', 'feeds');
const fixture = (id) => readFileSync(path.join(FIXTURES, `${id}.xml`), 'utf8');
const xml = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'application/xml', ...headers } });
const CF = () => new Response('<!DOCTYPE html><title>Just a moment...</title>', { status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' } });

function sandbox() {
  const dir = mkdtempSync(path.join(tmpdir(), 'bct-community-'));
  mkdirSync(path.join(dir, 'config'), { recursive: true });
  cpSync(path.join(ROOT, 'config', 'sources.json'), path.join(dir, 'config', 'sources.json'));
  cpSync(path.join(ROOT, 'config', 'routes.json'), path.join(dir, 'config', 'routes.json'));
  mkdirSync(path.join(dir, 'test', 'fixtures'), { recursive: true });
  cpSync(FIXTURES, path.join(dir, 'test', 'fixtures', 'feeds'), { recursive: true });
  return dir;
}

/** A network with one answer per source id; anything not listed is "not available". */
async function network(answers) {
  const config = JSON.parse(await readFile(path.join(ROOT, 'config', 'sources.json'), 'utf8'));
  const ids = new Map(config.sources.map((s) => [s.url, s.id]));
  const calls = [];
  const fetchImpl = async (url, init) => {
    const id = ids.get(String(url));
    calls.push({ id, ua: init?.headers?.['User-Agent'] });
    const a = answers[id];
    if (a instanceof Error) throw a;
    return typeof a === 'function' ? a() : a ?? new Response('', { status: 404 });
  };
  return { fetchImpl, calls };
}
const ALL_FIXTURES = () => Object.fromEntries(['travel-dealz', 'fly4free', 'theflightdeal', 'reddit-awardtravel', 'ptt-aviation', 'ptt-lifeismoney', 'milelion', 'headforpoints', 'doctorofcredit-status-match'].map((id) => [id, () => xml(fixture(id))]));

test('fetchSource: ok · blocked by Cloudflare · rate limited · HTTP error · not a feed · network down', async () => {
  const src = { url: 'https://example.com/feed' };
  const run = (res) => fetchSource(src, { fetchImpl: async () => (res instanceof Error ? Promise.reject(res) : res), userAgent: 'test' });
  const ok = await run(xml(fixture('fly4free')));
  assert.deepEqual([ok.status, ok.items.length], ['ok', 8]);
  const blocked = await run(CF());
  assert.deepEqual([blocked.status, blocked.error], ['blocked', 'blocked (Cloudflare)']);
  assert.equal((await run(new Response('error code: 1005', { status: 403 }))).status, 'blocked');
  const limited = await run(new Response('', { status: 429 }));
  assert.deepEqual([limited.status, limited.error], ['blocked', 'rate limited']);
  assert.deepEqual([(await run(new Response('nope', { status: 500 }))).status, (await run(new Response('nope', { status: 404 }))).error], ['error', 'HTTP 404']);
  assert.equal((await run(xml('<html><body>hello</body></html>'))).error, 'not a feed');
  assert.equal((await run(xml('<html>Just a moment... Enable JavaScript and cookies</html>'))).status, 'blocked', 'a challenge page served with 200');
  assert.equal((await run(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }))).error, 'ENOTFOUND');
});

test('triage: a program-level offer is a promotion, a fare with a route and price is a deal, China is gone', () => {
  const ctx = (kind) => ({ source: { id: 's', kind }, today: '2026-10-03', fx: { rates: { TWD: 1, EUR: 0.0272 } }, maxAgeDays: 21 });
  const raw = (title, extra = {}) => ({ id: 'x', url: 'https://e.com/x', published: '2026-10-03T08:00:00Z', summary: '', categories: [], title, ...extra });
  assert.equal(triage(raw('Qatar Privilege Club offering up to 35% transfer bonus'), ctx('both')).type, 'promo');
  assert.equal(triage(raw('Qatar Airways flights from Manila to Doha for €400'), ctx('both')).type, 'deal');
  assert.equal(triage(raw('Qatar Airways flights from Manila to Doha for €400'), ctx('promos')).type, undefined, 'a promo-only source never yields deals');
  assert.equal(triage(raw('EVA Air flash sale 20% off'), ctx('both')).type, 'promo', 'a sale without a route is a promotion');
  assert.equal(triage(raw('Cathay Pacific status match'), ctx('both')).drop, 'china');
  assert.equal(triage(raw('Best lounges in Doha'), ctx('both')).drop !== undefined, true);
});

test('dedupeDeals: the same trip posted by two sites appears once, remembering where else', () => {
  const mk = (id, src, relevance, over = {}) => ({ id, src, relevance, cabin: 'business', route: { o: { code: 'TPE' }, d: { code: 'CDG' } }, price: { twd: 60000 }, ...over });
  const out = dedupeDeals([mk('a', 'fly4free', 40), mk('b', 'secretflying', 55), mk('c', 'x', 30, { price: { twd: 90000 } }), mk('d', 'y', 30, { route: { o: null, d: null } })]);
  assert.deepEqual(out.map((d) => d.id), ['b', 'c', 'd']);
  assert.deepEqual(out[0].alsoIn, ['fly4free']);
});

test('runCommunity: sources fail independently and every outcome is published', async () => {
  const root = sandbox();
  const outDir = path.join(root, 'out');
  const net = await network({
    ...ALL_FIXTURES(),
    secretflying: CF,
    omaat: new Error('connect ETIMEDOUT'),
    viewfromthewing: () => new Response('', { status: 503 }),
    'reddit-awardtravel': () => new Response('', { status: 429 }),
  });
  const { out, newDeals, newPromos } = await runCommunity({ root, outDir, env: { OFFLINE: '1' }, fetchImpl: net.fetchImpl, log: quiet, today: '2026-10-03', sleepFn: async () => {} });
  const st = Object.fromEntries(out.sources.map((s) => [s.id, s]));
  assert.equal(st.secretflying.status, 'blocked');
  assert.equal(st['reddit-awardtravel'].status, 'blocked');
  assert.equal(st['reddit-awardtravel'].error, 'rate limited');
  assert.equal(st.omaat.status, 'error');
  assert.equal(st.viewfromthewing.status, 'error');
  assert.equal(st.flyertalk.status, 'disabled');
  assert.equal(st['reddit-flightdeals'].status, 'disabled');
  assert.equal(st['travel-dealz'].status, 'ok');
  assert.equal(st['travel-dealz'].excluded, 3, 'Shenzhen, Hainan ×2');
  assert.ok(out.deals.length > 5 && out.promos.length > 3, `${out.deals.length} deals, ${out.promos.length} promos`);
  assert.equal(out.stats.excluded.china, st['travel-dealz'].excluded + st.fly4free.excluded + (st.theflightdeal.excluded || 0) + (st['ptt-aviation'].excluded || 0) + (st.headforpoints.excluded || 0) + (st.milelion.excluded || 0) + (st['doctorofcredit-status-match'].excluded || 0) + (st['ptt-lifeismoney'].excluded || 0));
  assert.ok(net.calls.every((c) => /aethersky-deal-reader/.test(c.ua)), 'an honest user agent on every request');
  assert.equal(net.calls.filter((c) => c.id === 'flyertalk').length, 0, 'disabled sources are not even asked');
  // sorted by relevance; the strongest Taiwan-related post leads
  assert.ok(out.deals.every((d, i, a) => i === 0 || a[i - 1].relevance >= d.relevance));
  assert.match(out.deals[0].title, /Taipei, Taiwan/);
  assert.equal(newDeals.length, out.deals.length, 'first run: everything is new');
  assert.ok(newPromos.length > 0);
  // nothing from China, in any field
  const blob = JSON.stringify(out);
  assert.ok(!/Hainan Airlines|Shenzhen Airlines|Hong Kong|Cathay/.test(blob), 'no China / Hong Kong / Macau content survives');
  const saved = JSON.parse(await readFile(path.join(outDir, 'community.json'), 'utf8'));
  assert.equal(saved.version, 1);
  assert.equal(saved.sources.length, out.sources.length);
});

test('runCommunity: tomorrow keeps what left the feed (until it expires), keeps firstSeen, drops ended promotions', async () => {
  const root = sandbox();
  const outDir = path.join(root, 'out');
  const net1 = await network(ALL_FIXTURES());
  const day1 = await runCommunity({ root, outDir, env: { OFFLINE: '1' }, fetchImpl: net1.fetchImpl, log: quiet, today: '2026-10-03', sleepFn: async () => {} });
  const promoWithDeadline = day1.out.promos.find((p) => p.validTo);
  assert.ok(promoWithDeadline, 'Flying Blue promo has an end of October');
  // day 2: every source is silent
  const net2 = await network({});
  const day2 = await runCommunity({ root, outDir, env: { OFFLINE: '1' }, fetchImpl: net2.fetchImpl, log: quiet, today: '2026-10-05', sleepFn: async () => {} });
  assert.ok(day2.out.deals.length >= day1.out.deals.length - 2, 'what left the feed is kept (only the faintest, aged-out ones may fall under the relevance floor)');
  assert.ok(day2.out.deals.every((d) => day1.out.deals.some((x) => x.id === d.id)));
  assert.equal(day2.newDeals.length, 0, 'nothing new');
  const same = day2.out.deals.find((d) => d.id === day1.out.deals[0].id);
  assert.equal(same.firstSeen, '2026-10-03');
  assert.ok(same.relevance <= day1.out.deals[0].relevance, 'ages a little');
  // day 3: past the Flying Blue deadline → gone; deals older than keepDays → gone
  const day3 = await runCommunity({ root, outDir, env: { OFFLINE: '1' }, fetchImpl: net2.fetchImpl, log: quiet, today: '2026-11-02', sleepFn: async () => {} });
  assert.ok(!day3.out.promos.some((p) => p.id === promoWithDeadline.id));
  assert.equal(day3.out.deals.length, 0, 'every fixture post is more than 21 days old by then');
});

test('runCommunity: include filters keep general boards on topic', async () => {
  const root = sandbox();
  const outDir = path.join(root, 'out');
  const net = await network({ 'ptt-lifeismoney': () => xml(fixture('ptt-lifeismoney')) });
  const { out } = await runCommunity({ root, outDir, env: { OFFLINE: '1' }, fetchImpl: net.fetchImpl, log: quiet, today: '2026-10-03', sleepFn: async () => {} });
  const ptt = out.sources.find((s) => s.id === 'ptt-lifeismoney');
  assert.equal(ptt.status, 'ok');
  assert.equal(ptt.fresh, 0, 'petrol prices and jogging shoes are not travel news');
});

test('itemId is stable per source+post', () => {
  assert.equal(itemId('fly4free', 'https://x/1'), itemId('fly4free', 'https://x/1'));
  assert.notEqual(itemId('fly4free', 'https://x/1'), itemId('fly4free', 'https://x/2'));
  assert.notEqual(itemId('fly4free', 'https://x/1'), itemId('travel-dealz', 'https://x/1'));
});

// ───────────────────────── the digest ─────────────────────────
const D = (over = {}) => ({ id: 'd1', src: 'fly4free', url: 'https://f4f.example/1', title: 'Business class Taipei to Paris NT$30,000', kinds: ['error-fare'], cabin: 'business', relevance: 85, route: { o: { code: 'TPE' }, d: { code: 'CDG' } }, price: { amount: 30000, currency: 'TWD', twd: 30000 }, airlines: ['BR'], ...over });
const P = (over = {}) => ({ id: 'p1', src: 'travel-dealz', url: 'https://tdz.example/1', title: 'Marriott & JAL status match', kinds: ['status-match'], brands: [{ id: 'MARRIOTT', kind: 'hotel', program: 'MARRIOTT', carrier: null }], lock: [], validTo: '2026-12-31', relevance: 60, ...over });

test('digest: by default only the strongest new items; PROMO_ALERTS narrows it per person', () => {
  const weak = D({ id: 'd2', relevance: 30, kinds: ['sale'] });
  const locked = P({ id: 'p2', lock: ['US'], relevance: 70 });
  const def = defaultPick({ newDeals: [D(), weak], newPromos: [P(), locked, P({ id: 'p3', relevance: 20 })] });
  assert.deepEqual(def.deals.map((d) => d.id), ['d1']);
  assert.deepEqual(def.promos.map((p) => p.id), ['p1'], 'US-only and weak ones stay out');

  const alerts = parsePromoAlerts('[{"who":"USERA","brands":["marriott"],"kinds":["status-match"],"minRelevance":50,"deals":false},{"who":"userb","brands":["DL"]},{"bad":');
  assert.equal(alerts.length, 0, 'broken JSON is ignored, not fatal');
  const ok = parsePromoAlerts('[{"who":"USERA","brands":["marriott"],"kinds":["status-match"],"minRelevance":50,"deals":false},{"who":"userb","brands":["DL"]}]');
  assert.deepEqual(ok[0], { who: 'usera', brands: ['MARRIOTT'], kinds: ['status-match'], minRelevance: 50, deals: false });
  const a = personalPick({ newDeals: [D()], newPromos: [P(), P({ id: 'p4', brands: [{ id: 'DL', kind: 'airline', program: 'DL', carrier: 'DL' }], kinds: ['fare-sale'] })] }, ok[0]);
  assert.deepEqual([a.deals.length, a.promos.map((p) => p.id)], [0, ['p1']]);
  const b = personalPick({ newDeals: [D({ airlines: ['DL'] }), D({ id: 'dx', airlines: ['BR'] })], newPromos: [P(), P({ id: 'p4', brands: [{ id: 'DL', kind: 'airline', program: 'DL', carrier: 'DL' }], kinds: ['fare-sale'], relevance: 50 })] }, ok[1]);
  assert.deepEqual(b.promos.map((p) => p.id), ['p4']);
  assert.deepEqual(b.deals.map((d) => d.id), ['d1'], 'deals on an airline you named');
});

test('digest text: three languages, deadline, source link; HTML escapes everything', () => {
  const pick = { deals: [D()], promos: [P()] };
  const zh = formatDigest(pick, 'zh-TW', 'https://app.example/');
  assert.equal(zh.subject, '新情報：1 則好價、1 則活動');
  assert.match(zh.text, /🔥 台北桃園 → 巴黎 NT\$30,000/);
  assert.match(zh.text, /商務艙 · 疑似錯誤票價/);
  assert.match(zh.text, /🏅 萬豪旅享家.*: 會籍 Match/);
  assert.match(zh.text, /截止 2026-12-31/);
  assert.match(zh.text, /https:\/\/app\.example\/#deals\/community/);
  assert.match(formatDigest(pick, 'en').subject, /^New: 1 deal · 1 promotion$/);
  assert.match(formatDigest(pick, 'ko').text, /등급 매치/);
  const evil = formatDigest({ deals: [D({ title: '<script>alert(1)</script>' })], promos: [] }, 'en');
  assert.ok(!/<script>alert/.test(evil.html));
});

test('sendCommunityDigest: each person gets their own language and filter; one failure does not stop the rest; nothing → nothing', async () => {
  const mails = [];
  const transport = { send: async (m) => { if (m.to === 'broken@x.com') throw new Error('boom'); mails.push(m); } };
  const pushes = [];
  const fetchImpl = async (url, init) => (pushes.push({ url, init }), new Response('', { status: 200 }));
  const env = {
    ALERT_EMAILS: 'usera=usera@x.com#zh-TW, userb=userb@x.com#en, carol=broken@x.com', NTFY_TOPICS: 'usera=ua-topic@ko',
    PROMO_ALERTS: '[{"who":"userb","brands":["DL"],"deals":false}]',
  };
  const logs = [];
  const newPromos = [P(), P({ id: 'p4', brands: [{ id: 'DL', kind: 'airline', program: 'DL', carrier: 'DL' }], kinds: ['fare-sale'], relevance: 58 })];
  const sent = await sendCommunityDigest({ newDeals: [D()], newPromos }, { env, transport, fetchImpl, log: (m) => logs.push(m), siteUrl: 'https://app.example/' });
  assert.deepEqual(mails.map((m) => m.to), ['usera@x.com'].concat(['userb@x.com']), 'carol failed, others went through');
  assert.match(mails[0].subject, /新情報/);
  assert.match(mails[1].subject, /^New: 1 promotion$/, 'userb only asked for Delta promotions');
  assert.ok(logs.some((l) => /carol/.test(l)));
  assert.equal(pushes.length, 1);
  assert.match(pushes[0].url, /ntfy\.sh\/ua-topic$/);
  assert.ok(sent.includes('ntfy:usera:200') && sent.includes('mail:usera'));
  assert.deepEqual(await sendCommunityDigest({ newDeals: [], newPromos: [] }, { env, transport, fetchImpl }), []);
});

test('CLI: offline fixtures → community.json; first run sends no digest; COMMUNITY_NOTIFICATIONS=paused sends nothing', async () => {
  const root = sandbox();
  const logs = [];
  const first = await runCli({ root, env: { COMMUNITY_OFFLINE: '1', OFFLINE: '1' }, log: (m) => logs.push(m), today: '2026-10-03' });
  assert.ok(existsSync(path.join(root, 'web', 'data', 'community.json')));
  assert.ok(first.out.deals.length > 0 && first.out.promos.length > 0);
  assert.ok(logs.some((l) => /first run/.test(l)));
  assert.deepEqual(first.sent, []);
  const posts = [];
  const fetchImpl = async (url, init) => {
    if (String(url).includes('ntfy')) {
      posts.push(url);
      return new Response('', { status: 200 });
    }
    return (await offlineFetch(root))(url);
  };
  const second = await runCli({ root, env: { OFFLINE: '1', NTFY_TOPICS: 'usera=t1@en' }, fetchImpl, log: quiet, today: '2026-10-04' });
  assert.deepEqual(second.newDeals, [], 'the same posts again are not new');
  assert.equal(posts.length, 0);
  const off = await offlineFetch(root);
  assert.equal((await off('https://nowhere.example/feed')).status, 404);
  await writeFile(path.join(root, 'config', 'routes.json'), JSON.stringify({ communityNotifications: 'paused' }));
  const third = await runCli({ root, env: { OFFLINE: '1', NTFY_TOPICS: 'usera=t1@en' }, fetchImpl, log: (m) => logs.push(m), today: '2026-10-05' });
  assert.deepEqual(third.sent, []);
  assert.ok(logs.some((l) => /paused/.test(l)));
});
