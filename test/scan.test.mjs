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
    PRICE_ALERTS: JSON.stringify([{ who: 'blue', route: 'TPE-CDG', maxTWD: 130000 }]),
    NTFY_TOPICS: 'sean=t-sean@zh-TW,blue=t-blue@en',
  };
  const { out, alertHits } = await runScan({ root, outDir, env, fetchImpl, today: '2026-09-26', log: quiet });
  assert.ok(out.deals.every((d) => d.routeKey === 'TPE-CDG' && d.label === 'Paris'));
  assert.equal(alertHits.get('blue')[0].deal.primaryCarrier, 'KE', 'cheapest China-free option (KE 112,000) — never CX/AF');
  assert.ok(pushed.some((p) => p.topic === 't-blue' && /target NT\$130,000/.test(p.body)));
  assert.ok(!pushed.some((p) => p.topic === 't-sean' && /target/.test(p.body)), 'Sean does not get Blue\'s personal alert');
  assert.equal(JSON.stringify(out).includes('t-blue'), false, 'topics never published');
  assert.ok(pushed.every((p) => p.click === 'https://business-class-tracker.vercel.app/'), 'push links open the Vercel app');
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
