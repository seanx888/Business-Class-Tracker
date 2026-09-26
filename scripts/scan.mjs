#!/usr/bin/env node
// Daily business-class fare scan.
//   1. plan today's searches (watch trips + priority rotation)
//   2. query the fare provider (SerpApi Google Flights / Duffel / demo)
//   3. drop EVERY itinerary touching China / Hong Kong / Macau (carrier or airport)
//   4. score deals, merge with recent ones, update price history
//   5. write web/data/deals.json + history.json, optionally push a digest
//
// Env: FARE_PROVIDER (serpapi|duffel|demo), SERPAPI_KEY, SERPAPI_VERIFY_RETURN, SERPAPI_DEEP_SEARCH,
//      DUFFEL_ACCESS_TOKEN, SEARCHES_PER_RUN, SCAN_DATE, SITE_URL,
//      NTFY_TOPICS / NTFY_TOKEN / NTFY_SERVER (push), WATCH_TRIPS / PRICE_ALERTS (JSON, kept out of the public repo)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkItinerary } from '../web/core/exclusion.js';
import { summarizeItinerary, pickReference, scoreDeal } from '../web/core/scoring.js';
import { airportRegion, AIRPORTS } from '../web/core/airports.js';
import { AIRLINES } from '../web/core/airlines.js';
import { buildPlan, dayIndex } from './lib/plan.mjs';
import { emptyHistory, recordLow, pruneHistory, routeStats } from './lib/history.mjs';
import { fetchFx, toTWD, FALLBACK_FX } from './lib/fx.mjs';
import { searchSerpApi } from './providers/serpapi.mjs';
import { searchDuffel } from './providers/duffel.mjs';
import { demoSearch } from './providers/demo.mjs';
import { sendNotifications } from './notify.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const taipeiToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function pickProvider(env, fetchImpl = fetch) {
  const name = (env.FARE_PROVIDER || '').toLowerCase() ||
    (env.SERPAPI_KEY ? 'serpapi' : env.DUFFEL_ACCESS_TOKEN ? 'duffel' : 'demo');
  if (name === 'serpapi') {
    if (!env.SERPAPI_KEY) throw new Error('FARE_PROVIDER=serpapi but SERPAPI_KEY is not set');
    return {
      name,
      delayMs: Number(env.SCAN_DELAY_MS ?? 1200),
      secret: env.SERPAPI_KEY,
      search: (q, filter) => searchSerpApi(q, {
        apiKey: env.SERPAPI_KEY,
        currency: 'TWD',
        deepSearch: env.SERPAPI_DEEP_SEARCH === 'true',
        verifyReturn: Number(env.SERPAPI_VERIFY_RETURN || 0),
        filter,
        fetchImpl,
      }),
    };
  }
  if (name === 'duffel') {
    if (!env.DUFFEL_ACCESS_TOKEN) throw new Error('FARE_PROVIDER=duffel but DUFFEL_ACCESS_TOKEN is not set');
    return {
      name,
      delayMs: Number(env.SCAN_DELAY_MS ?? 700),
      secret: env.DUFFEL_ACCESS_TOKEN,
      search: (q) => searchDuffel(q, { token: env.DUFFEL_ACCESS_TOKEN, fetchImpl }),
    };
  }
  if (name === 'demo') return { name, delayMs: 0, secret: null, search: async (q) => demoSearch(q) };
  throw new Error(`Unknown FARE_PROVIDER "${name}"`);
}

const scaleBenchmark = (bm, f) => (bm ? { typical: Math.round(bm.typical * f), deal: Math.round(bm.deal * f) } : null);

// Drop null / undefined / empty arrays to keep the published JSON small.
function compact(obj) {
  if (Array.isArray(obj)) return obj.map(compact);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || (Array.isArray(v) && !v.length)) continue;
      out[k] = compact(v);
    }
    return out;
  }
  return obj;
}

// Names the app can look up itself are dropped from the published JSON.
function slimLegs(legs) {
  return legs.map((l) => ({
    ...l,
    segments: l.segments.map((s) => ({
      ...s,
      fromName: AIRPORTS[s.from] ? null : s.fromName,
      toName: AIRPORTS[s.to] ? null : s.toName,
      carrierName: AIRLINES[s.carrier] ? null : s.carrierName,
    })),
    layovers: (l.layovers || []).map((x) => ({ ...x, name: AIRPORTS[x.airport] ? null : x.name })),
  }));
}

// JSON arrays passed as repository variables (so personal trips/targets stay out of the public repo).
function parseJsonList(value, name, log) {
  if (!value || !String(value).trim()) return [];
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? v : [v];
  } catch {
    log(`⚠ ${name} is not valid JSON — ignored`);
    return [];
  }
}

const comboKey = (d) => `${d.origin}-${d.destination}|${d.departDate}|${d.returnDate || ''}`;
const daysBetween = (a, b) => dayIndex(b) - dayIndex(a);

export async function runScan({
  root = ROOT,
  outDir = path.join(root, 'web', 'data'),
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  today = env.SCAN_DATE || taipeiToday(),
} = {}) {
  const config = JSON.parse(await readFile(path.join(root, 'config', 'routes.json'), 'utf8'));
  config.watchTrips = [...(config.watchTrips || []), ...parseJsonList(env.WATCH_TRIPS, 'WATCH_TRIPS', log)];
  const priceAlerts = [...(config.priceAlerts || []), ...parseJsonList(env.PRICE_ALERTS, 'PRICE_ALERTS', log)];
  const baseCountries = await readJson(path.join(root, 'config', 'airport-countries.json'), {});
  const provider = pickProvider(env, fetchImpl);
  const maxSearches = Number(env.SEARCHES_PER_RUN) || config.searchesPerRun?.[provider.name] || 8;
  const plan = buildPlan(config, { today, maxSearches });
  const prev = await readJson(path.join(outDir, 'deals.json'), null);
  let history = await readJson(path.join(outDir, 'history.json'), emptyHistory());
  // Never mix demo prices into real price history (or vice versa).
  if ((history.provider || 'demo') !== provider.name && Object.keys(history.routes || {}).length) history = emptyHistory();
  history.provider = provider.name;
  const fx = env.OFFLINE === '1' ? { ...FALLBACK_FX } : await fetchFx(fetchImpl);
  const homeAirports = config.homeAirports || ['TPE'];
  const exFactor = config.exStationBenchmarkFactor || 0.85;
  const keepPerSearch = config.keepPerSearch || 3;

  const stats = { planned: plan.length, searches: 0, offersSeen: 0, kept: 0, excluded: { china: 0, unverified: 0 }, errors: [], samples: [] };
  const fresh = [];
  const searched = new Set();
  const redact = (msg) => (provider.secret ? String(msg).split(provider.secret).join('***') : String(msg));

  log(`▶ ${today} · provider=${provider.name} · ${plan.length} searches planned (budget ${maxSearches})`);

  for (const q of plan) {
    if (stats.searches >= maxSearches) break;
    const originCfg = config.origins?.[q.origin] || { type: homeAirports.includes(q.origin) ? 'home' : 'exstation' };
    const bmRaw = config.benchmarks?.[q.route.bm] || null;
    const benchmark = originCfg.type === 'exstation' ? scaleBenchmark(bmRaw, exFactor) : bmRaw;
    let countries = baseCountries;
    const filter = (itin) => checkItinerary(itin, { countries }).ok;

    let res;
    try {
      res = await provider.search({ ...q, benchmark, originType: originCfg.type }, filter);
    } catch (e) {
      stats.errors.push(`${q.key} ${q.departDate}: ${redact(e.message)}`);
      log(`  ✗ ${q.key} ${q.departDate} — ${redact(e.message)}`);
      stats.searches++;
      continue;
    }
    stats.searches += res.searches || 1;
    searched.add(`${q.key}|${q.departDate}|${q.returnDate || ''}`);
    // Provider-supplied countries may add airports, but never override our own data.
    countries = res.countries ? { ...res.countries, ...baseCountries } : baseCountries;

    const insights = res.insights ? { ...res.insights } : null;
    if (insights?.typicalRange && res.offers[0]?.currency && res.offers[0].currency !== 'TWD') {
      insights.typicalRange = insights.typicalRange.map((v) => toTWD(v, res.offers[0].currency, fx));
    }
    const hs = routeStats(history, q.key, today);
    const reference = pickReference({ insights, historyMedian: hs.median, historyCount: hs.count, benchmark });

    const clean = [];
    for (const offer of res.offers) {
      stats.offersSeen++;
      const chk = checkItinerary(offer, { countries });
      if (!chk.ok) {
        stats.excluded[chk.category]++;
        if (stats.samples.length < 12) {
          stats.samples.push({
            route: q.key,
            carriers: [...new Set(offer.legs.flatMap((l) => l.segments.map((s) => s.carrier)))].join('/'),
            reason: chk.reasons[0].detail,
          });
        }
        continue;
      }
      const priceTWD = toTWD(offer.price, offer.currency, fx);
      if (!priceTWD) continue;
      const summary = summarizeItinerary(offer, homeAirports);
      const flightIds = offer.legs.map((l) => l.segments.map((s) => (s.flightNumber || s.carrier).replace(/\s+/g, '')).join('.')).join('_');
      const deal = {
        id: `${q.key}-${q.departDate}-${q.returnDate || 'OW'}-${flightIds}`,
        routeKey: q.key,
        origin: q.origin,
        destination: q.destination,
        originType: originCfg.type,
        region: airportRegion(q.destination),
        departDate: q.departDate,
        returnDate: q.returnDate,
        label: q.label,
        price: offer.price,
        currency: offer.currency,
        priceTWD,
        reference,
        priceLevel: insights?.level || null,
        ...summary,
        legs: slimLegs(offer.legs),
        inboundVerified: !q.returnDate || !!offer.inboundVerified,
        provider: provider.name,
        firstSeen: today,
        lastSeen: today,
        ageDays: 0,
      };
      const s = scoreDeal(deal);
      Object.assign(deal, { score: s.score, tier: s.tier, discountPct: s.discountPct, errorFare: s.errorFare });
      clean.push(deal);
    }

    clean.sort((a, b) => a.priceTWD - b.priceTWD);
    if (clean.length) recordLow(history, q.key, { date: today, priceTWD: clean[0].priceTWD, carrier: clean[0].primaryCarrier, departDate: q.departDate, returnDate: q.returnDate });

    // Keep the cheapest few (distinct carriers) + best SkyTeam + best nonstop — what a frequent flyer wants to see.
    const keep = [];
    const seenCarrier = new Set();
    for (const d of clean) {
      if (keep.length >= keepPerSearch) break;
      if (seenCarrier.has(d.primaryCarrier)) continue;
      seenCarrier.add(d.primaryCarrier);
      keep.push(d);
    }
    for (const pickFn of [(d) => d.alliance === 'SKYTEAM', (d) => d.stops === 0]) {
      const best = clean.find(pickFn);
      if (best && !keep.includes(best)) keep.push(best);
    }
    fresh.push(...keep);
    stats.kept += keep.length;
    log(`  ✓ ${q.key} ${q.departDate}${q.returnDate ? '→' + q.returnDate : ''}: ${res.offers.length} offers, ${clean.length} China-free, kept ${keep.length}`);
    if (provider.delayMs) await sleep(provider.delayMs);
  }

  // Merge with recent deals from previous runs (rotation means most routes aren't searched daily).
  const prevById = new Map((prev?.deals || []).map((d) => [d.id, d]));
  for (const d of fresh) {
    const old = prevById.get(d.id);
    if (old?.firstSeen) d.firstSeen = old.firstSeen;
  }
  const ttl = config.dealTtlDays ?? 4;
  const carried = (prev?.deals || []).filter((d) =>
    d.provider === provider.name &&
    !searched.has(comboKey(d)) &&
    d.departDate > today &&
    daysBetween(d.lastSeen, today) <= ttl &&
    checkItinerary(d, { countries: baseCountries }).ok);
  for (const d of carried) {
    d.ageDays = daysBetween(d.lastSeen, today);
    const s = scoreDeal(d);
    Object.assign(d, { score: s.score, tier: s.tier, discountPct: s.discountPct, errorFare: s.errorFare });
  }

  const deals = [...fresh, ...carried].sort((a, b) => b.score - a.score).slice(0, 400).map(compact);
  pruneHistory(history, today);
  const alertHits = evaluatePriceAlerts(priceAlerts, deals, history, today);

  const rates = {};
  for (const c of fx.display || Object.keys(fx.rates)) if (fx.rates[c]) rates[c] = fx.rates[c];

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    scanDate: today,
    provider: provider.name,
    isDemo: provider.name === 'demo',
    currency: 'TWD',
    fx: { date: fx.date, source: fx.source, rates },
    stats,
    homeAirports,
    origins: config.origins,
    routes: (config.routes || []).map((r) => ({ key: `${r.o}-${r.d}`, o: r.o, d: r.d, p: r.p, region: airportRegion(r.d), bm: config.benchmarks?.[r.bm] || null })),
    deals,
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'deals.json'), JSON.stringify(out) + '\n');
  await writeFile(path.join(outDir, 'history.json'), JSON.stringify(history) + '\n');
  log(`■ ${deals.length} deals published · ${stats.offersSeen} offers seen · excluded ${stats.excluded.china} China/HK/MO + ${stats.excluded.unverified} unverified · ${stats.errors.length} errors`);

  // Push only genuinely new, strong deals + personal target hits (never for demo data unless asked).
  const minScore = Number(env.NOTIFY_MIN_SCORE) || config.notifyMinScore || 72;
  const newGood = deals.filter((d) => d.firstSeen === today && d.score >= minScore).slice(0, 8);
  let sent = [];
  if ((newGood.length || alertHits.size) && (!out.isDemo || env.NOTIFY_DEMO === '1')) {
    const [owner, repo] = (env.GITHUB_REPOSITORY || '').split('/');
    const siteUrl = env.SITE_URL || (owner && repo ? `https://${owner}.github.io/${repo}/` : null);
    try {
      sent = await sendNotifications(newGood, alertHits, { env, siteUrl, fetchImpl });
      if (sent.length) log(`🔔 notified: ${sent.join(', ')}`);
    } catch (e) {
      log(`notify failed: ${e.message}`);
    }
  }

  return { out, history, alertHits, sent, allFailed: plan.length > 0 && searched.size === 0 };
}

/**
 * Personal price targets: [{ who: 'blue' | ['sean','blue'] | 'all', route: 'TPE-CDG', maxTWD: 110000 }].
 * Fires when today's scan found the route at/below the target; repeats only if it gets cheaper
 * or after 7 days. State lives in history.alerts.
 * @returns {Map<string, {deal, maxTWD}[]>} hits keyed by person
 */
export function evaluatePriceAlerts(alerts, deals, history, today) {
  const hits = new Map();
  const state = (history.alerts ||= {});
  for (const a of alerts) {
    const route = String(a?.route || '').toUpperCase().replace(/\s+/g, '');
    const max = Number(a?.maxTWD);
    if (!/^[A-Z]{3}-[A-Z]{3}$/.test(route) || !(max > 0)) continue;
    const best = deals
      .filter((d) => d.routeKey === route && d.lastSeen === today && d.priceTWD <= max)
      .sort((x, y) => x.priceTWD - y.priceTWD)[0];
    if (!best) continue;
    for (const who of [].concat(a.who || 'all').map((w) => String(w).trim().toLowerCase())) {
      const k = `${who}|${route}|${max}`;
      const last = state[k];
      if (last && daysBetween(last.date, today) < 7 && best.priceTWD >= last.price) continue;
      state[k] = { price: best.priceTWD, date: today, id: best.id };
      if (!hits.has(who)) hits.set(who, []);
      hits.get(who).push({ deal: best, maxTWD: max });
    }
  }
  for (const [k, v] of Object.entries(state)) if (daysBetween(v.date, today) > 60) delete state[k];
  return hits;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runScan()
    .then(({ allFailed }) => {
      if (allFailed) {
        console.error('::error::Every search failed — check the API key / quota. Previous data left untouched in git.');
        process.exit(1);
      }
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
