#!/usr/bin/env node
// Daily refresh of the community deal feed and the airline / hotel promotions (web/data/community.json).
//   node scripts/community.mjs
//
// Env: COMMUNITY_OFFLINE=1   read test/fixtures/feeds/<source id>.xml instead of the network (CI smoke test, local development)
//      COMMUNITY_NOTIFICATIONS=paused   fetch and publish, but send no push / e-mail
//      PROMO_ALERTS, ALERT_EMAILS, SMTP_URL / RESEND_API_KEY, NTFY_TOPICS, SITE_URL   see scripts/community-notify.mjs
// A failing source is reported in the data and the step summary; the script only fails when something is truly broken.
import { readFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCommunity } from './lib/community.mjs';
import { sendCommunityDigest } from './community-notify.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** A fetch that answers from test/fixtures/feeds/<source id>.xml — for offline runs. */
export async function offlineFetch(root = ROOT) {
  const config = JSON.parse(await readFile(path.join(root, 'config', 'sources.json'), 'utf8'));
  const ids = new Map(config.sources.map((s) => [s.url, s.id]));
  return async (url) => {
    const id = ids.get(String(url));
    const file = id && path.join(root, 'test', 'fixtures', 'feeds', `${id}.xml`);
    if (!file || !existsSync(file)) return new Response('not available offline', { status: 404 });
    return new Response(await readFile(file, 'utf8'), { status: 200, headers: { 'content-type': 'application/xml' } });
  };
}

export async function main({ root = ROOT, env = process.env, log = console.log, fetchImpl, today } = {}) {
  const outDir = path.join(root, 'web', 'data');
  const impl = fetchImpl || (env.COMMUNITY_OFFLINE === '1' ? await offlineFetch(root) : fetch);
  const prevExists = existsSync(path.join(outDir, 'community.json'));
  log(`▶ community feed${env.COMMUNITY_OFFLINE === '1' ? ' (offline fixtures)' : ''}`);
  const { out, newDeals, newPromos } = await runCommunity({ root, outDir, env, fetchImpl: impl, log, today });

  const routes = JSON.parse(await readFile(path.join(root, 'config', 'routes.json'), 'utf8').catch(() => '{}'));
  const siteUrl = env.SITE_URL || routes.siteUrl || null;
  const on = String(env.COMMUNITY_NOTIFICATIONS || routes.communityNotifications || 'on').trim().toLowerCase() !== 'paused';
  let sent = [];
  if (!on) log('🔕 community notifications paused — nothing sent');
  else if (!prevExists) log('ℹ first run — everything looks new, so no digest is sent');
  else if (env.COMMUNITY_OFFLINE === '1') log('ℹ offline fixtures — no digest is sent');
  else if (newDeals.length || newPromos.length) {
    try {
      sent = await sendCommunityDigest({ newDeals, newPromos }, { env, siteUrl, fetchImpl: impl, log });
      log(sent.length ? `🔔 digest sent: ${sent.join(', ')}` : '🔕 new items, but no channel configured (ALERT_EMAILS + SMTP_URL, or NTFY_TOPICS) or nothing strong enough');
    } catch (e) {
      log(`digest failed: ${e.message}`);
    }
  }

  if (env.GITHUB_STEP_SUMMARY) {
    const mark = { ok: '✅', blocked: '⛔', error: '⚠️', disabled: '·' };
    const rows = out.sources.map((s) => `| ${mark[s.status] || ''} ${s.name} | ${s.status}${s.error ? ` — ${s.error}` : ''} | ${s.items ?? ''} | ${s.deals ?? ''} / ${s.promos ?? ''} |`);
    await appendFile(env.GITHUB_STEP_SUMMARY, `### 🧭 Community feed ${out.scanDate}\n\n${out.deals.length} deals (${newDeals.length} new) · ${out.promos.length} promotions (${newPromos.length} new) · ${out.stats.excluded.china} China/HK/Macau posts excluded\n\n| Source | Status | Posts | Deals / promos |\n|---|---|---|---|\n${rows.join('\n')}\n`).catch(() => {});
  }
  return { out, newDeals, newPromos, sent };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
