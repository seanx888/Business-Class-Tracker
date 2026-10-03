// Community deals + airline / hotel promotions — fetch the configured feeds, sort every post into "deal" or "promotion"
// (or drop it), merge with yesterday's list, and describe how each source did.
//
//   runCommunity({ root, outDir, env, fetchImpl, today }) → writes web/data/community.json, returns { out, newDeals, newPromos }
//
// One source failing — blocked by Cloudflare, rate-limited, down, not a feed any more — never costs the others, and the
// state of every source is published so the app can say "Secret Flying: blocked" instead of silently showing nothing.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseFeed } from './rss.mjs';
import { classifyDeal, relevanceOf, mentionsChina } from '../../web/core/community.js';
import { classifyPromo, detectPromoKinds, promoRelevance } from '../../web/core/promos.js';
import { fetchFx } from './fx.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;
const BLOCK_BODY = /just a moment|cf-browser-verification|attention required|error code:\s*1\d{3}|access denied|enable javascript and cookies/i;

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Short stable id from a source id + the post's own id/url. */
export function itemId(sourceId, key) {
  let h = 2166136261;
  const s = `${sourceId}|${key}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${sourceId.slice(0, 3)}${(h >>> 0).toString(36)}`;
}

/**
 * Fetch one feed. status: ok · blocked (Cloudflare / rate limit) · error (network, HTTP, not a feed).
 * @returns {{ status: string, httpStatus?: number, error?: string, items: object[] }}
 */
export async function fetchSource(src, { fetchImpl = fetch, userAgent, timeoutMs = 25000 } = {}) {
  let res;
  try {
    res = await fetchImpl(src.url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
  } catch (e) {
    return { status: 'error', error: String(e.cause?.code || e.message || e).slice(0, 120), items: [] };
  }
  const body = await res.text().catch(() => '');
  if (!res.ok) {
    const blocked = [403, 429, 503].includes(res.status) && (res.headers.get('cf-mitigated') || res.status === 429 || BLOCK_BODY.test(body.slice(0, 4000)));
    return { status: blocked ? 'blocked' : 'error', httpStatus: res.status, error: blocked ? (res.status === 429 ? 'rate limited' : 'blocked (Cloudflare)') : `HTTP ${res.status}`, items: [] };
  }
  const feed = parseFeed(body);
  if (feed.format === 'unknown' || (!feed.items.length && BLOCK_BODY.test(body.slice(0, 4000)))) {
    return { status: BLOCK_BODY.test(body.slice(0, 4000)) ? 'blocked' : 'error', httpStatus: res.status, error: 'not a feed', items: [] };
  }
  return { status: 'ok', httpStatus: res.status, items: feed.items };
}

/**
 * Deal or promotion? A post can look like both ("Qatar flights … 35% off").
 *   • status match, bonus miles, award sale → a promotion (a program-level offer), whatever else it mentions
 *   • otherwise a fare with a price and a route → a deal
 *   • otherwise a fare sale / new route of an airline → a promotion
 */
export function triage(raw, ctx) {
  const { source } = ctx;
  const wantsDeal = source.kind === 'deals' || source.kind === 'both';
  const wantsPromo = source.kind === 'promos' || source.kind === 'both';
  const promoKinds = detectPromoKinds(`${raw.title}. ${raw.summary || ''}`.slice(0, 1200), raw.categories || []);
  const strongPromo = promoKinds.some((k) => ['status-match', 'bonus-miles', 'award-sale'].includes(k));
  const attempts = strongPromo ? ['promo', 'deal'] : ['deal', 'promo'];
  let lastDrop = 'not-a-deal';
  for (const kind of attempts) {
    if ((kind === 'deal' && !wantsDeal) || (kind === 'promo' && !wantsPromo)) continue;
    const r = kind === 'deal' ? classifyDeal(raw, ctx) : classifyPromo(raw, ctx);
    if (r.item) return { type: kind, item: r.item };
    if (r.drop === 'china') return { drop: 'china' };
    lastDrop = r.drop;
  }
  return { drop: lastDrop };
}

/** Same trip posted by several sites: keep the most relevant one and remember where else it appeared. */
export function dedupeDeals(deals) {
  const sig = (d) => (d.route?.o && d.route?.d && d.price?.twd ? `${d.route.o.code}|${d.route.d.code}|${d.cabin || ''}|${Math.round(d.price.twd / 1500)}` : null);
  const best = new Map();
  const out = [];
  for (const d of [...deals].sort((a, b) => b.relevance - a.relevance)) {
    const k = sig(d);
    if (!k) {
      out.push(d);
      continue;
    }
    const first = best.get(k);
    if (first) {
      (first.alsoIn ||= []).push(d.src);
      continue;
    }
    best.set(k, d);
    out.push(d);
  }
  return out;
}

const byRelevance = (a, b) => b.relevance - a.relevance || String(b.published).localeCompare(String(a.published));

export async function runCommunity({
  root, outDir, env = process.env, fetchImpl = fetch, log = console.log, today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), fx = null, sleepFn = sleep,
} = {}) {
  const config = JSON.parse(await readFile(path.join(root, 'config', 'sources.json'), 'utf8'));
  const prev = await readJson(path.join(outDir, 'community.json'), { deals: [], promos: [] });
  const rates = fx || (env.OFFLINE === '1' ? { rates: { TWD: 1, USD: 0.0315, EUR: 0.0272, GBP: 0.0235, SGD: 0.0405, JPY: 4.6, KRW: 43.6, PHP: 1.8, THB: 1.02, MYR: 0.133, VND: 830, AUD: 0.0448 } } : await fetchFx(fetchImpl));
  const keepDays = config.keepDays ?? 21;
  const stats = { fetched: 0, deals: 0, promos: 0, excluded: { china: 0 }, dropped: {} };
  const sources = [];
  const freshDeals = [];
  const freshPromos = [];

  for (const src of config.sources) {
    const row = { id: src.id, name: src.name, url: src.url, kind: src.kind, region: src.region };
    if (src.enabled === false) {
      sources.push({ ...row, status: 'disabled', note: src.note || null });
      continue;
    }
    const got = await fetchSource(src, { fetchImpl, userAgent: config.userAgent });
    Object.assign(row, { status: got.status, httpStatus: got.httpStatus, error: got.error || null, items: got.items.length, fresh: 0, deals: 0, promos: 0, excluded: 0, note: src.note || null });
    if (got.status === 'ok') {
      const include = src.include ? new RegExp(src.include, 'i') : null;
      for (const raw of got.items) {
        if (include && !include.test(`${raw.title} ${raw.summary || ''}`)) continue;
        stats.fetched++;
        const ctx = { source: src, fx: rates, today, maxAgeDays: keepDays };
        const r = triage({ ...raw, id: itemId(src.id, raw.id || raw.url) }, ctx);
        if (r.drop) {
          stats.dropped[r.drop] = (stats.dropped[r.drop] || 0) + 1;
          if (r.drop === 'china') {
            row.excluded++;
            stats.excluded.china++;
          }
          continue;
        }
        row.fresh++;
        if (r.type === 'deal') {
          row.deals++;
          freshDeals.push(r.item);
        } else {
          row.promos++;
          freshPromos.push(r.item);
        }
      }
    }
    log(`  ${row.status === 'ok' ? '✓' : row.status === 'blocked' ? '⛔' : '✗'} ${src.id}: ${row.status}${row.error ? ` (${row.error})` : ''} · ${row.items} posts → ${row.deals ?? 0} deals, ${row.promos ?? 0} promos`);
    sources.push(row);
    await sleepFn(src.delayMs ?? 1200);
  }

  // Merge with the previous run: posts that left the feed stay for keepDays; everything is re-judged for today.
  const merge = (fresh, old, rejudge) => {
    const byId = new Map(old.map((x) => [x.id, x]));
    const out = new Map();
    for (const x of fresh) {
      const o = byId.get(x.id);
      out.set(x.id, { ...x, firstSeen: o?.firstSeen || today });
    }
    for (const o of old) {
      if (out.has(o.id)) continue;
      if (Math.round((Date.parse(today) - Date.parse(o.published || o.firstSeen || today)) / DAY) > keepDays) continue;
      const kept = rejudge(o);
      if (kept) out.set(o.id, kept);
    }
    return [...out.values()];
  };
  const deals = merge(freshDeals, prev.deals || [], (o) => {
    if (mentionsChina(`${o.title} ${o.summary || ''}`)) return null;
    return { ...o, relevance: relevanceOf(o, { today }) };
  });
  const promos = merge(freshPromos, prev.promos || [], (o) => {
    if (o.validTo && o.validTo < today) return null;
    return { ...o, relevance: promoRelevance(o, { today }) };
  });

  const minD = config.minRelevance?.deals ?? 15;
  const minP = config.minRelevance?.promos ?? 25;
  const outDeals = dedupeDeals(deals.filter((d) => d.relevance >= minD)).sort(byRelevance).slice(0, config.maxDeals ?? 250);
  const outPromos = promos.filter((p) => p.relevance >= minP).sort(byRelevance).slice(0, config.maxPromos ?? 150);
  stats.deals = outDeals.length;
  stats.promos = outPromos.length;

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    scanDate: today,
    sources,
    stats,
    deals: outDeals,
    promos: outPromos,
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'community.json'), JSON.stringify(out) + '\n');
  const newDeals = outDeals.filter((d) => d.firstSeen === today);
  const newPromos = outPromos.filter((p) => p.firstSeen === today);
  log(`■ community: ${outDeals.length} deals (${newDeals.length} new) · ${outPromos.length} promotions (${newPromos.length} new) · ${stats.excluded.china} China/HK/Macau posts excluded`);
  return { out, newDeals, newPromos };
}
