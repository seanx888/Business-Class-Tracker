#!/usr/bin/env node
// Daily business-class fare scan.
//   1. plan today's searches (watch trips + priority rotation)
//   2. query the fare provider (SerpApi Google Flights / Duffel / demo)
//   3. drop EVERY itinerary touching China / Hong Kong / Macau (carrier or airport)
//   4. score deals, merge with recent ones, update price history
//   5. write web/data/deals.json + history.json, optionally push a digest
//
//   6. Real Tracker: search each tracked trip, detect price changes, e-mail / push alerts → trackers.json
//
// Env: FARE_PROVIDER (serpapi|duffel|demo), SERPAPI_KEY (+ optional SERPAPI_KEY_2), SERPAPI_VERIFY_RETURN,
//      SERPAPI_DEEP_SEARCH, DUFFEL_ACCESS_TOKEN, SEARCHES_PER_RUN, SCAN_DATE, SITE_URL,
//      NTFY_TOPICS / NTFY_TOKEN / NTFY_SERVER (push), WATCH_TRIPS / PRICE_ALERTS (JSON, kept out of the public repo),
//      TRACKERS (JSON, Real Tracker), ALERT_EMAILS + SMTP_URL or RESEND_API_KEY (+ MAIL_FROM), TRACKER_NOTIFICATIONS

import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkItinerary } from '../web/core/exclusion.js';
import { summarizeItinerary, pickReference, scoreDeal } from '../web/core/scoring.js';
import { airportRegion, AIRPORTS } from '../web/core/airports.js';
import { AIRLINES } from '../web/core/airlines.js';
import { buildPlan, dayIndex } from './lib/plan.mjs';
import { emptyHistory, recordLow, pruneHistory, routeStats } from './lib/history.mjs';
import { fetchFx, toTWD, FALLBACK_FX } from './lib/fx.mjs';
import { searchSerpApi, serpApiAccount, isQuotaError } from './providers/serpapi.mjs';
import { searchDuffel } from './providers/duffel.mjs';
import { demoSearch, demoPos } from './providers/demo.mjs';
import { pickMarkets, matchOffer, posResult, summarizePos } from './lib/pos.mjs';
import { sendNotifications } from './notify.mjs';
import { parseTrackers } from '../web/core/trackers.js';
import { emptyTrackerState, planTrackerSearches, recordTrackerSample, updateTrackerState, evaluateTrackerAlerts } from './lib/trackers.mjs';
import { sendTrackerAlerts } from './tracker-notify.mjs';

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

export function serpApiKeys(env) {
  return [env.SERPAPI_KEY, env.SERPAPI_KEY_2].map((k) => String(k || '').trim()).filter(Boolean);
}

export function pickProvider(env, fetchImpl = fetch) {
  const keys = serpApiKeys(env);
  const name = (env.FARE_PROVIDER || '').toLowerCase() ||
    (keys.length ? 'serpapi' : env.DUFFEL_ACCESS_TOKEN ? 'duffel' : 'demo');
  if (name === 'serpapi') {
    if (!keys.length) throw new Error('FARE_PROVIDER=serpapi but SERPAPI_KEY is not set');
    // Optional second key (SERPAPI_KEY_2): used when the first key's monthly quota runs out.
    let keyIdx = 0;
    const base = {
      currency: 'TWD',
      deepSearch: env.SERPAPI_DEEP_SEARCH === 'true',
      fetchImpl,
    };
    const call = async (q, opts) => {
      for (;;) {
        try {
          return await searchSerpApi(q, { ...base, ...opts, apiKey: keys[keyIdx] });
        } catch (e) {
          if (isQuotaError(e) && keyIdx < keys.length - 1) {
            keyIdx++;
            continue;
          }
          throw e;
        }
      }
    };
    return {
      name,
      delayMs: Number(env.SCAN_DELAY_MS ?? 1200),
      secrets: keys,
      search: (q, filter) => call(q, { verifyReturn: Number(env.SERPAPI_VERIFY_RETURN || 0), filter }),
      // Same trip in another Google Flights market (point-of-sale check); never verifies return legs.
      pos: (q, market) => call(q, { gl: market.country, currency: market.currency, verifyReturn: 0 }),
      // Free Account API: searches left across all keys; start with the first key that still has quota.
      quota: async () => {
        const accounts = await Promise.all(keys.map((k) => serpApiAccount(k, fetchImpl).catch(() => null)));
        if (accounts.every((a) => !a)) return null;
        const firstWithQuota = accounts.findIndex((a) => a && a.left > 0);
        if (firstWithQuota >= 0) keyIdx = firstWithQuota;
        return {
          left: accounts.reduce((n, a) => n + (a?.left || 0), 0),
          perMonth: accounts.reduce((n, a) => n + (a?.perMonth || 0), 0) || null,
          keys: keys.length,
        };
      },
    };
  }
  if (name === 'duffel') {
    if (!env.DUFFEL_ACCESS_TOKEN) throw new Error('FARE_PROVIDER=duffel but DUFFEL_ACCESS_TOKEN is not set');
    return {
      name,
      delayMs: Number(env.SCAN_DELAY_MS ?? 700),
      secrets: [env.DUFFEL_ACCESS_TOKEN],
      search: (q) => searchDuffel(q, { token: env.DUFFEL_ACCESS_TOKEN, fetchImpl }),
    };
  }
  if (name === 'demo') {
    return { name, delayMs: 0, secrets: [], search: async (q) => demoSearch(q), pos: async (q, market, ctx) => demoPos(q, market, ctx) };
  }
  throw new Error(`Unknown FARE_PROVIDER "${name}"`);
}

/** Days left in the current month, today included (SerpApi quotas are monthly). */
export function daysLeftInMonth(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
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

// Benchmark group for a tracker route that is not in config/routes.json.
const REGION_BM = { JP: 'JP', KR: 'KR', SEA: 'SEA', EU: 'EU', NA: 'NA_WEST', OC: 'OC', ME: 'ME' };
function benchmarkKeyFor(config, o, d) {
  return config.routes?.find((r) => r.o === o && r.d === d)?.bm || REGION_BM[airportRegion(d)] || null;
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
  const trackers = parseTrackers([config.trackers || [], env.TRACKERS || ''], log);
  const baseCountries = await readJson(path.join(root, 'config', 'airport-countries.json'), {});
  const provider = pickProvider(env, fetchImpl);
  let maxSearches = Number(env.SEARCHES_PER_RUN) || config.searchesPerRun?.[provider.name] || 8;
  const notes = [];
  if (provider.name === 'demo' && !env.FARE_PROVIDER) notes.push('SERPAPI_KEY / DUFFEL_ACCESS_TOKEN not set → demo data');

  // Pace SerpApi usage so the monthly quota lasts until the end of the month.
  let quota = null;
  if (provider.quota) {
    try {
      quota = await provider.quota();
    } catch {
      quota = null;
    }
    if (quota) {
      const dailyCap = Math.floor(quota.left / daysLeftInMonth(today));
      maxSearches = Math.min(maxSearches, quota.left > 0 ? Math.max(1, dailyCap) : 0);
      quota.dailyCap = dailyCap;
      if (!quota.left) notes.push('SerpApi quota used up for this month — keeping recent deals');
    }
  }

  // Point-of-sale (foreign-site) checks get a small reserved slice of the daily budget.
  const posCfg = config.pos || {};
  const posWanted = posCfg.enabled && provider.pos ? (provider.name === 'demo' ? posCfg.demoChecks ?? 24 : posCfg.checksPerRun ?? 2) : 0;
  const posReserve = provider.name === 'demo' ? 0 : Math.min(posWanted, Math.max(0, maxSearches - 1));
  const prev = await readJson(path.join(outDir, 'deals.json'), null);
  let history = await readJson(path.join(outDir, 'history.json'), emptyHistory());
  // Never mix demo prices into real price history (or vice versa).
  if ((history.provider || 'demo') !== provider.name && Object.keys(history.routes || {}).length) history = emptyHistory();
  history.provider = provider.name;
  let trackerState = await readJson(path.join(outDir, 'trackers.json'), emptyTrackerState());
  if ((trackerState.provider || provider.name) !== provider.name) trackerState = emptyTrackerState();
  trackerState.trackers ||= {};

  // Real Tracker searches come first (someone explicitly asked for them) but may use at most ~75 % of
  // the budget so the route rotation keeps moving; the demo provider has no budget.
  const searchBudget = Math.max(0, maxSearches - posReserve);
  const trackerBudget = provider.name === 'demo' ? searchBudget
    : searchBudget > 0 ? Math.max(1, Math.ceil(searchBudget * (config.trackerShare ?? 0.75))) : 0;
  const trackerPlan = planTrackerSearches(trackers, trackerState, { today, budget: trackerBudget }).map((q) => ({
    ...q,
    scanDate: today,
    route: { o: q.origin, d: q.destination, bm: benchmarkKeyFor(config, q.origin, q.destination), p: 1 },
  }));
  const plan = [...trackerPlan, ...buildPlan(config, { today, maxSearches: searchBudget - trackerPlan.length })];
  const fx = env.OFFLINE === '1' ? { ...FALLBACK_FX } : await fetchFx(fetchImpl);
  const homeAirports = config.homeAirports || ['TPE'];
  const exFactor = config.exStationBenchmarkFactor || 0.85;
  const keepPerSearch = config.keepPerSearch || 3;

  const stats = { planned: plan.length, searches: 0, offersSeen: 0, kept: 0, excluded: { china: 0, unverified: 0 }, errors: [], samples: [], notes, pos: { checked: 0, cheaper: 0 }, trackers: { active: trackers.filter((t) => !t.paused).length, searches: 0, alerts: 0 } };
  if (quota) stats.quota = { left: quota.left, perMonth: quota.perMonth, dailyCap: quota.dailyCap, keys: quota.keys };
  const fresh = [];
  const searched = new Set();
  const redact = (msg) => provider.secrets.reduce((m, sec) => m.split(sec).join('***'), String(msg));

  log(`▶ ${today} · provider=${provider.name} · ${plan.length} searches planned (budget ${maxSearches}${posReserve ? `, ${posReserve} for foreign-site checks` : ''}${trackerPlan.length ? `, ${trackerPlan.length} for ${trackers.length} tracker${trackers.length > 1 ? 's' : ''}` : ''})`);
  for (const n of notes) log(`  ℹ ${n}`);
  if (quota) log(`  ℹ SerpApi quota: ${quota.left} searches left (${quota.keys} key${quota.keys > 1 ? 's' : ''}) → up to ${quota.dailyCap}/day`);

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
    if (q.kind === 'tracker') {
      const s = recordTrackerSample(trackerState, q, clean, { today, insights });
      stats.trackers.searches++;
      log(`  ◎ tracker ${q.trackerId} ${q.key} ${q.departDate}${q.returnDate ? '→' + q.returnDate : ''} ${q.cabin}: ${s ? `NT$${s.p.toLocaleString('en-US')} ${s.c}` : 'no China-free result'}`);
      // Only business-class tracker results also feed the deal list and price history.
      if (q.cabin !== 'business') {
        if (provider.delayMs) await sleep(provider.delayMs);
        continue;
      }
    }
    // Full-service and LCC fares are tracked separately so cheap LCCs never crowd out full-service options.
    const fsc = clean.filter((d) => !d.budget);
    const lcc = clean.filter((d) => d.budget);
    const low = (d) => ({ date: today, priceTWD: d.priceTWD, carrier: d.primaryCarrier, departDate: q.departDate, returnDate: q.returnDate });
    if (fsc.length) recordLow(history, q.key, low(fsc[0]));
    if (lcc.length) recordLow(history, q.key, low(lcc[0]), 'lcc');

    // Keep the cheapest few full-service fares (distinct carriers) + best SkyTeam + best nonstop,
    // plus the cheapest LCC options — what a frequent flyer wants to see.
    const keep = [];
    const pickDistinct = (list, n) => {
      const seen = new Set();
      for (const d of list) {
        if (seen.size >= n) break;
        if (seen.has(d.primaryCarrier)) continue;
        seen.add(d.primaryCarrier);
        keep.push(d);
      }
    };
    pickDistinct(fsc, keepPerSearch);
    for (const pickFn of [(d) => d.alliance === 'SKYTEAM', (d) => d.stops === 0]) {
      const best = fsc.find(pickFn);
      if (best && !keep.includes(best)) keep.push(best);
    }
    pickDistinct(lcc, config.keepLccPerSearch ?? 2);
    fresh.push(...keep);
    stats.kept += keep.length;
    log(`  ✓ ${q.key} ${q.departDate}${q.returnDate ? '→' + q.returnDate : ''}: ${res.offers.length} offers, ${clean.length} China-free, kept ${keep.length}`);
    if (provider.delayMs) await sleep(provider.delayMs);
  }

  // Point-of-sale checks: re-price today's best full-service deals in other countries' markets.
  const posBudget = provider.name === 'demo' ? posWanted : Math.max(0, maxSearches - stats.searches);
  if (posWanted && posBudget > 0) {
    const perDeal = Math.max(1, posCfg.marketsPerDeal ?? 2);
    const candidates = fresh.filter((d) => !d.budget).sort((a, b) => b.score - a.score);
    let used = 0;
    for (const d of candidates) {
      if (used >= posBudget) break;
      const markets = pickMarkets(d, posCfg.markets || [], { perDeal: Math.min(perDeal, posBudget - used), dayIdx: dayIndex(today), countries: baseCountries });
      const results = [];
      for (const m of markets) {
        try {
          const q = { origin: d.origin, destination: d.destination, departDate: d.departDate, returnDate: d.returnDate };
          const res = await provider.pos(q, m, { fx, deal: d });
          used += res.searches || 1;
          const hit = matchOffer(d, res.offers, { countries: baseCountries });
          if (hit) results.push(posResult(d, m, hit, fx));
        } catch (e) {
          used++;
          stats.errors.push(`POS ${m.country} ${d.routeKey}: ${redact(e.message)}`);
        }
        stats.pos.checked++;
        if (provider.delayMs) await sleep(provider.delayMs);
      }
      d.pos = summarizePos(results, today, posCfg.minSavingsPct ?? 3);
      if (d.pos.best) {
        stats.pos.cheaper++;
        log(`  🌏 ${d.routeKey} ${d.primaryCarrier}: ${d.pos.best.country} site ${d.pos.best.savingsPct}% cheaper`);
      }
    }
    stats.searches += provider.name === 'demo' ? 0 : used;
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
  // Notifications can be paused in config/routes.json ("notifications": "paused") or with the
  // NOTIFICATIONS repository variable (on | paused), which wins over the config.
  const notificationsOn = String(env.NOTIFICATIONS || config.notifications || 'on').trim().toLowerCase() !== 'paused';
  const alertHits = notificationsOn ? evaluatePriceAlerts(priceAlerts, deals, history, today) : new Map();

  // Real Tracker: refresh results, then decide which price changes are worth an alert. Tracker alerts have
  // their own switch (TRACKER_NOTIFICATIONS) because people asked for them explicitly.
  updateTrackerState(trackerState, trackers, today);
  const trackerAlertsOn = String(env.TRACKER_NOTIFICATIONS || config.trackerNotifications || 'on').trim().toLowerCase() !== 'paused';
  const trackerAlerts = trackerAlertsOn ? evaluateTrackerAlerts(trackerState, trackers, today) : [];
  stats.trackers.alerts = trackerAlerts.length;
  Object.assign(trackerState, { version: 1, provider: provider.name, generatedAt: new Date().toISOString(), scanDate: today, notifications: trackerAlertsOn ? 'on' : 'paused' });

  const rates = {};
  for (const c of fx.display || Object.keys(fx.rates)) if (fx.rates[c]) rates[c] = fx.rates[c];

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    scanDate: today,
    provider: provider.name,
    isDemo: provider.name === 'demo',
    notifications: notificationsOn ? 'on' : 'paused',
    currency: 'TWD',
    fx: { date: fx.date, source: fx.source, rates },
    stats,
    homeAirports,
    people: config.people || [],
    origins: config.origins,
    routes: (config.routes || []).map((r) => ({ key: `${r.o}-${r.d}`, o: r.o, d: r.d, p: r.p, region: airportRegion(r.d), bm: config.benchmarks?.[r.bm] || null })),
    deals,
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'deals.json'), JSON.stringify(out) + '\n');
  await writeFile(path.join(outDir, 'history.json'), JSON.stringify(history) + '\n');
  await writeFile(path.join(outDir, 'trackers.json'), JSON.stringify(trackerState) + '\n');
  log(`■ ${deals.length} deals published · ${stats.offersSeen} offers seen · excluded ${stats.excluded.china} China/HK/MO + ${stats.excluded.unverified} unverified · ${stats.errors.length} errors`);

  // Push only genuinely new, strong deals + personal target hits (never for demo data unless asked).
  const minScore = Number(env.NOTIFY_MIN_SCORE) || config.notifyMinScore || 72;
  const newGood = deals.filter((d) => d.firstSeen === today && d.score >= minScore).slice(0, 8);
  const [owner, repo] = (env.GITHUB_REPOSITORY || '').split('/');
  const siteUrl = env.SITE_URL || config.siteUrl || (owner && repo ? `https://${owner}.github.io/${repo}/` : null);
  let sent = [];
  if (!notificationsOn) log('🔕 notifications paused — nothing sent');
  else if ((newGood.length || alertHits.size) && (!out.isDemo || env.NOTIFY_DEMO === '1')) {
    try {
      sent = await sendNotifications(newGood, alertHits, { env, siteUrl, fetchImpl });
      if (sent.length) log(`🔔 notified: ${sent.join(', ')}`);
    } catch (e) {
      log(`notify failed: ${e.message}`);
    }
  }

  let trackerSent = [];
  if (trackerAlerts.length && (!out.isDemo || env.NOTIFY_DEMO === '1')) {
    trackerSent = await sendTrackerAlerts(trackerAlerts, { env, siteUrl, fetchImpl, log });
    log(`📈 tracker alerts: ${trackerAlerts.map((a) => `${a.tracker.id}:${a.kind}`).join(', ')} → ${trackerSent.join(', ') || 'no channel configured (ALERT_EMAILS + SMTP_URL, or NTFY_TOPICS)'}`);
  } else if (!trackerAlertsOn && trackers.length) log('🔕 tracker notifications paused');

  // Human-readable run summary on the GitHub Actions run page.
  if (env.GITHUB_STEP_SUMMARY) {
    const rows = [
      ['Provider', provider.name === 'demo' ? `demo ⚠️ ${notes.join('; ')}` : `${provider.name} ✅`],
      ['Searches', `${stats.searches} (planned ${plan.length}${posReserve ? ` + ${posReserve} foreign-site` : ''})`],
      ...(quota ? [['SerpApi quota left', `${quota.left} (${quota.keys} key${quota.keys > 1 ? 's' : ''}) → up to ${quota.dailyCap}/day`]] : []),
      ['Deals published', String(deals.length)],
      ['Excluded CN/HK/MO', `${stats.excluded.china} (+${stats.excluded.unverified} unverified)`],
      ['Cheaper on a foreign site', `${stats.pos.cheaper} of ${stats.pos.checked} checks`],
      ['Real Tracker', `${trackers.length} tracker${trackers.length === 1 ? '' : 's'} · ${stats.trackers.searches} searches · ${trackerAlerts.length} alert${trackerAlerts.length === 1 ? '' : 's'}${trackerSent.length ? ` (sent: ${trackerSent.join(', ')})` : ''}`],
      ['Notifications', notificationsOn ? 'on' : 'paused'],
      ['Errors', String(stats.errors.length)],
    ];
    await appendFile(env.GITHUB_STEP_SUMMARY, `### ✈️ Fare scan ${today}\n\n| | |\n|---|---|\n${rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n`).catch(() => {});
  }

  return { out, history, alertHits, sent, trackerState, trackerAlerts, trackerSent, allFailed: plan.length > 0 && searched.size === 0 };
}

/**
 * Personal price targets: [{ who: 'userb' | ['usera','userb'] | 'all', route: 'TPE-CDG', maxTWD: 110000 }].
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
