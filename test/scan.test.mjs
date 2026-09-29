import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScan } from '../scripts/scan.mjs';
import { checkItinerary } from '../web/core/exclusion.js';
import { formatDigest } from '../scripts/notify.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const quiet = () => {};

async function sandbox(configPatch) {
  const dir = await mkdtemp(path.join(tmpdir(), 'bct-'));
  await mkdir(path.join(dir, 'config'), { recursive: true });
  await cp(path.join(ROOT, 'config', 'airport-countries.json'), path.join(dir, 'config', 'airport-countries.json'));
  const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config', 'routes.json')));
  await writeFile(path.join(dir, 'config', 'routes.json'), JSON.stringify({ ...cfg, ...configPatch }));
  return dir;
}

test('demo scan end-to-end: publishes deals, none touch China/HK/Macau, history recorded', async () => {
  const root = await sandbox();
  const outDir = path.join(root, 'out');
  const env = { FARE_PROVIDER: 'demo', OFFLINE: '1' };
  const { out } = await runScan({ root, outDir, env, today: '2026-09-26', log: quiet });
  assert.equal(out.isDemo, true);
  assert.ok(out.deals.length > 50);
  assert.ok(out.stats.excluded.china > 0, 'demo traps should be excluded');
  for (const d of out.deals) {
    assert.equal(checkItinerary(d).ok, true, d.id);
    assert.ok(d.priceTWD > 0 && d.score >= 0 && d.tier);
    assert.ok(d.departDate > '2026-09-26');
  }
  assert.ok(out.deals.some((d) => d.alliance === 'SKYTEAM'));
  const saved = JSON.parse(await readFile(path.join(outDir, 'deals.json'), 'utf8'));
  assert.equal(saved.deals.length, out.deals.length);
  const history = JSON.parse(await readFile(path.join(outDir, 'history.json'), 'utf8'));
  assert.ok(Object.keys(history.routes).length > 20);

  // Second day: old deals are carried (TTL) and firstSeen preserved.
  const second = await runScan({ root, outDir, env: { ...env, SEARCHES_PER_RUN: '3' }, today: '2026-09-27', log: quiet });
  assert.ok(second.out.deals.some((d) => d.firstSeen === '2026-09-26' && d.ageDays === 1));
});

test('SerpApi scan with mocked HTTP: excluded offers never published, key never leaked', async () => {
  const root = await sandbox({ watchTrips: [] });
  const outDir = path.join(root, 'out');
  const serp = JSON.parse(readFileSync(new URL('./fixtures/serpapi-tpe-cdg.json', import.meta.url)));
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'serpapi.com') {
      if (u.searchParams.get('arrival_id') === 'NRT') return new Response(JSON.stringify({ error: `Boom for key ${u.searchParams.get('api_key')}` }), { status: 500 });
      return new Response(JSON.stringify(serp), { status: 200 });
    }
    throw new Error('offline');
  };
  const env = { SERPAPI_KEY: 'sk-SECRET-123', SEARCHES_PER_RUN: '4', SCAN_DELAY_MS: '0' };
  const { out } = await runScan({ root, outDir, env, fetchImpl, today: '2026-09-26', log: quiet });
  assert.equal(out.provider, 'serpapi');
  assert.equal(out.fx.source, 'fallback');
  assert.ok(out.deals.length > 0);
  for (const d of out.deals) {
    const carriers = d.legs.flatMap((l) => l.segments.map((s) => s.carrier));
    assert.ok(!carriers.includes('CX') && !carriers.includes('AF'), d.id);
    assert.equal(d.inboundVerified, false);
    assert.equal(d.reference.source, 'google');
  }
  const raw = await readFile(path.join(outDir, 'deals.json'), 'utf8');
  assert.ok(!raw.includes('SECRET'), 'API key must never be written to published data');
});

test('switching from demo to a real provider drops demo deals and demo price history', async () => {
  const root = await sandbox({ watchTrips: [] });
  const outDir = path.join(root, 'out');
  await runScan({ root, outDir, env: { FARE_PROVIDER: 'demo', OFFLINE: '1' }, today: '2026-09-26', log: quiet });
  const serp = readFileSync(new URL('./fixtures/serpapi-tpe-cdg.json', import.meta.url), 'utf8');
  const fetchImpl = async (url) => (new URL(url).hostname === 'serpapi.com' ? new Response(serp) : Promise.reject(new Error('offline')));
  const { out, history } = await runScan({ root, outDir, env: { SERPAPI_KEY: 'k', SEARCHES_PER_RUN: '2', SCAN_DELAY_MS: '0' }, fetchImpl, today: '2026-09-27', log: quiet });
  assert.ok(out.deals.every((d) => d.provider === 'serpapi'));
  assert.equal(history.provider, 'serpapi');
  assert.ok(Object.values(history.routes).flat().every((e) => e[0] === '2026-09-27'));
});

test('WATCH_TRIPS / PRICE_ALERTS repository variables drive searches and ntfy pushes', async () => {
  const root = await sandbox({ watchTrips: [] });
  const outDir = path.join(root, 'out');
  const serp = readFileSync(new URL('./fixtures/serpapi-tpe-cdg.json', import.meta.url), 'utf8');
  const pushed = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    if (u.hostname === 'serpapi.com') return new Response(serp);
    if (u.hostname === 'ntfy.sh') {
      pushed.push({ topic: u.pathname.slice(1), body: init.body, click: init.headers.Click });
      return new Response('ok');
    }
    throw new Error('offline');
  };
  const env = {
    SERPAPI_KEY: 'k', SEARCHES_PER_RUN: '1', SCAN_DELAY_MS: '0',
    WATCH_TRIPS: JSON.stringify([{ o: 'TPE', d: 'CDG', depart: '2026-11-10', return: '2026-11-24', label: 'Paris' }]),
    PRICE_ALERTS: JSON.stringify([{ who: 'userb', route: 'TPE-CDG', maxTWD: 130000 }]),
    NTFY_TOPICS: 'usera=t-usera@zh-TW,userb=t-userb@en',
    NOTIFICATIONS: 'on', // repository variable overrides the paused default in config
  };
  const { out, alertHits } = await runScan({ root, outDir, env, fetchImpl, today: '2026-09-26', log: quiet });
  assert.equal(out.notifications, 'on');
  assert.ok(out.deals.every((d) => d.routeKey === 'TPE-CDG' && d.label === 'Paris'));
  assert.equal(alertHits.get('userb')[0].deal.primaryCarrier, 'KE', 'cheapest China-free option (KE 112,000) — never CX/AF');
  assert.ok(pushed.some((p) => p.topic === 't-userb' && /target NT\$130,000/.test(p.body)));
  assert.ok(!pushed.some((p) => p.topic === 't-usera' && /target/.test(p.body)), 'USERA does not get USERB\'s personal alert');
  assert.equal(JSON.stringify(out).includes('t-userb'), false, 'topics never published');
  assert.ok(pushed.every((p) => p.click === 'https://aethersky.bluechiou.com/'), 'push links open the Vercel app');
});

test('notifications paused (config default): nothing is pushed even with NTFY_TOPICS set', async () => {
  const root = await sandbox({ watchTrips: [] });
  const serp = readFileSync(new URL('./fixtures/serpapi-tpe-cdg.json', import.meta.url), 'utf8');
  const pushed = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'serpapi.com') return new Response(serp);
    if (u.hostname === 'ntfy.sh') pushed.push(url);
    return Promise.reject(new Error('offline'));
  };
  const env = {
    SERPAPI_KEY: 'k', SEARCHES_PER_RUN: '1', SCAN_DELAY_MS: '0', NTFY_TOPICS: 'usera=t-usera@zh-TW',
    WATCH_TRIPS: JSON.stringify([{ o: 'TPE', d: 'CDG', depart: '2026-11-10', return: '2026-11-24' }]),
    PRICE_ALERTS: JSON.stringify([{ who: 'usera', route: 'TPE-CDG', maxTWD: 999999 }]),
  };
  const logs = [];
  const { out, alertHits, sent } = await runScan({ root, outDir: path.join(root, 'out'), env, fetchImpl, today: '2026-09-26', log: (m) => logs.push(m) });
  assert.equal(out.notifications, 'paused');
  assert.equal(alertHits.size, 0);
  assert.deepEqual(sent, []);
  assert.deepEqual(pushed, []);
  assert.ok(logs.some((l) => /notifications paused/.test(l)));
});

test('LCC fares are kept separately and never crowd out full-service options', async () => {
  const root = await sandbox({ watchTrips: [] });
  const serp = JSON.parse(readFileSync(new URL('./fixtures/serpapi-tpe-cdg.json', import.meta.url), 'utf8'));
  const br = serp.best_flights[0];
  const lcc = (code, name, price) => ({
    ...br,
    price,
    flights: br.flights.map((f) => ({ ...f, airline: name, flight_number: `${code} 1`, airline_logo: `x/${code}.png` })),
  });
  // Four LCC offers, all cheaper than every full-service offer.
  serp.other_flights.push(lcc('VJ', 'Vietjet', 52000), lcc('TW', "T'way Air", 55000), lcc('ZG', 'ZIPAIR', 58000), lcc('D7', 'AirAsia X', 60000));
  const body = JSON.stringify(serp);
  const fetchImpl = async (url) => (new URL(url).hostname === 'serpapi.com' ? new Response(body) : Promise.reject(new Error('offline')));
  const env = { SERPAPI_KEY: 'k', SEARCHES_PER_RUN: '1', SCAN_DELAY_MS: '0', WATCH_TRIPS: JSON.stringify([{ o: 'TPE', d: 'CDG', depart: '2026-11-10', return: '2026-11-24' }]) };
  const { out, history } = await runScan({ root, outDir: path.join(root, 'out'), env, fetchImpl, today: '2026-09-26', log: quiet });
  const fsc = out.deals.filter((d) => !d.budget).map((d) => d.primaryCarrier).sort();
  const lccKept = out.deals.filter((d) => d.budget).map((d) => d.primaryCarrier);
  assert.deepEqual(fsc, ['BR', 'KE'], 'every China-free full-service option is still published');
  assert.deepEqual(lccKept, ['VJ', 'TW'], 'only the two cheapest LCC options are kept');
  assert.equal(history.routes['TPE-CDG'][0][1], 112000, 'full-service history ignores LCC prices');
  assert.equal(history.lcc['TPE-CDG'][0][1], 52000);
});

test('SerpApi: quota pacing, second-key failover, foreign-site (VN) check, keys never leaked', async () => {
  const root = await sandbox({ watchTrips: [], pos: { enabled: true, checksPerRun: 2, marketsPerDeal: 1, minSavingsPct: 3, markets: [{ country: 'VN', currency: 'VND' }] } });
  const outDir = path.join(root, 'out');
  const serp = JSON.parse(readFileSync(new URL('./fixtures/serpapi-tpe-cdg.json', import.meta.url), 'utf8'));
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.hostname !== 'serpapi.com') throw new Error('offline');
    const key = u.searchParams.get('api_key');
    if (u.pathname === '/account.json') {
      return new Response(JSON.stringify({ total_searches_left: key === 'KEY-ONE-secret' ? 0 : 30, searches_per_month: 250 }));
    }
    calls.push({ key, gl: u.searchParams.get('gl'), currency: u.searchParams.get('currency') });
    if (key === 'KEY-ONE-secret') return new Response(JSON.stringify({ error: 'Your account has run out of searches.' }), { status: 429 });
    if (u.searchParams.get('gl') === 'vn') {
      // Same flights, priced in VND on the Vietnam market: 2,720,000 VND ≈ NT$3,400 cheaper on BR 87.
      const vn = JSON.parse(JSON.stringify(serp));
      for (const g of [...vn.best_flights, ...vn.other_flights]) g.price = Math.round(g.price * 0.9 * 800);
      return new Response(JSON.stringify(vn));
    }
    return new Response(JSON.stringify(serp));
  };
  const env = {
    SERPAPI_KEY: 'KEY-ONE-secret', SERPAPI_KEY_2: 'KEY-TWO-secret', SCAN_DELAY_MS: '0',
    WATCH_TRIPS: JSON.stringify([{ o: 'TPE', d: 'CDG', depart: '2026-11-10', return: '2026-11-24' }]),
  };
  const fxFetch = async (url, init) => (String(url).includes('er-api') ? new Response(JSON.stringify({ result: 'success', time_last_update_unix: 1790380952, rates: { TWD: 1, VND: 800, THB: 1, IDR: 500, PHP: 1.8, MYR: 0.13, SGD: 0.04, KRW: 43, JPY: 4.6, INR: 2.6, USD: 0.031 } })) : fetchImpl(url, init));
  const summary = path.join(root, 'summary.md');
  const { out } = await runScan({ root, outDir, env: { ...env, GITHUB_STEP_SUMMARY: summary }, fetchImpl: fxFetch, today: '2026-09-27', log: quiet });

  // 30 searches left on key 2, 4 days left in September → at most 7 searches today.
  assert.deepEqual(out.stats.quota, { left: 30, perMonth: 500, dailyCap: 7, keys: 2 });
  assert.ok(out.stats.searches <= 7);
  assert.ok(calls.every((c) => c.key === 'KEY-TWO-secret'), 'exhausted key 1 is skipped');
  assert.ok(calls.some((c) => c.gl === 'vn' && c.currency === 'VND'), 'Vietnam market checked');
  assert.ok(calls.filter((c) => c.gl === 'vn').length <= 2, 'foreign-site checks stay within their reserved budget');
  const withPos = out.deals.filter((d) => d.pos?.best);
  assert.ok(withPos.length >= 1);
  assert.equal(withPos[0].pos.best.country, 'VN');
  assert.equal(withPos[0].pos.best.match, 'exact');
  assert.ok(withPos[0].pos.best.savingsPct > 9 && withPos[0].pos.best.savingsPct < 11);
  const raw = await readFile(path.join(outDir, 'deals.json'), 'utf8');
  assert.ok(!raw.includes('KEY-ONE') && !raw.includes('KEY-TWO'), 'API keys never published');
  const md = await readFile(summary, 'utf8');
  assert.match(md, /serpapi ✅/);
  assert.match(md, /SerpApi quota left \| 30 \(2 keys\) → up to 7\/day/);
  assert.ok(!md.includes('secret'));
});

test('demo scan simulates foreign-site checks and flags missing keys in the summary', async () => {
  const root = await sandbox();
  const summary = path.join(root, 'summary.md');
  const { out } = await runScan({ root, outDir: path.join(root, 'out'), env: { OFFLINE: '1', GITHUB_STEP_SUMMARY: summary }, today: '2026-09-27', log: quiet });
  assert.ok(out.stats.pos.checked > 0);
  assert.ok(out.deals.some((d) => d.pos?.markets?.length), 'some demo deals carry foreign-site prices');
  assert.match(await readFile(summary, 'utf8'), /demo ⚠️ SERPAPI_KEY \/ DUFFEL_ACCESS_TOKEN not set/);
});

test('invalid JSON in variables is ignored, not fatal', async () => {
  const root = await sandbox();
  const logs = [];
  const { out } = await runScan({ root, outDir: path.join(root, 'out'), env: { FARE_PROVIDER: 'demo', OFFLINE: '1', SEARCHES_PER_RUN: '2', WATCH_TRIPS: '{oops', PRICE_ALERTS: 'nope' }, today: '2026-09-26', log: (m) => logs.push(m) });
  assert.ok(out.deals.length > 0);
  assert.ok(logs.some((l) => /WATCH_TRIPS is not valid JSON/.test(l)));
});

test('notification digest is compact and readable', () => {
  const txt = formatDigest([{ origin: 'TPE', destination: 'CDG', priceTWD: 98500, discountPct: 30, tier: 'hot', primaryCarrier: 'CI', stops: 0, departDate: '2026-11-10', returnDate: '2026-11-24' }], 'https://x.github.io/y/');
  assert.match(txt, /TPE→CDG/);
  assert.match(txt, /NT\$98,500/);
  assert.match(txt, /中華航空/);
  assert.match(txt, /https:\/\/x\.github\.io\/y\//);
});
