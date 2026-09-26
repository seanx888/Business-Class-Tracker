// Push notifications via ntfy (https://ntfy.sh) — free, no account needed, iOS + Android apps.
//
// Secret NTFY_TOPICS: comma-separated subscribers, each `name=topic@lang` (name and lang optional):
//   sean=bct-sean-7Hq2xP9w@zh-TW,blue=bct-blue-Lm4vR8kz@en
// Everyone gets the daily digest in their own language; personal price targets
// (config/routes.json → priceAlerts) go only to the named person.
// Optional: NTFY_SERVER (self-hosted), NTFY_TOKEN (access token for protected topics).
import { airlineName } from '../web/core/airlines.js';
import { airportCity } from '../web/core/airports.js';

const TIER_ICON = { hot: '🔥', great: '⭐', good: '👍', fair: '·' };
const nt = (n) => 'NT$' + Math.round(n).toLocaleString('en-US');

const L = {
  'zh-TW': {
    title: '商務艙好價', header: (n) => `✈️ 商務艙好價 (${n})`, nonstop: '直飛', stops: (n) => `${n}轉`,
    alertTitle: '目標價達成', alert: (r, p, max) => `🎯 ${r} ${p}（目標 ${max}）`, open: '開啟 App',
  },
  en: {
    title: 'Business class deals', header: (n) => `✈️ Business class deals (${n})`, nonstop: 'nonstop', stops: (n) => `${n} stop`,
    alertTitle: 'Price target hit', alert: (r, p, max) => `🎯 ${r} ${p} (target ${max})`, open: 'Open app',
  },
  ko: {
    title: '비즈니스석 특가', header: (n) => `✈️ 비즈니스석 특가 (${n})`, nonstop: '직항', stops: (n) => `${n}회 경유`,
    alertTitle: '목표가 도달', alert: (r, p, max) => `🎯 ${r} ${p} (목표 ${max})`, open: '앱 열기',
  },
};
const langOf = (lang) => (L[lang] ? lang : String(lang || '').startsWith('zh') ? 'zh-TW' : String(lang || '').startsWith('ko') ? 'ko' : 'en');

/** Parse `name=topic@lang, topic2, …` → [{ name, topic, lang }] */
export function parseSubscribers(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const [left, lang] = entry.split('@');
      const [maybeName, maybeTopic] = left.includes('=') ? left.split('=') : [null, left];
      return { name: (maybeName || `subscriber${i + 1}`).trim().toLowerCase(), topic: maybeTopic.trim(), lang: langOf((lang || 'zh-TW').trim()) };
    })
    .filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s.topic));
}

function dealLine(d, lang) {
  const s = L[langOf(lang)];
  const disc = d.discountPct != null && d.discountPct > 0 ? ` ▼${d.discountPct}%` : '';
  const stops = d.stops === 0 ? s.nonstop : s.stops(d.stops);
  const dates = `${d.departDate}${d.returnDate ? '~' + d.returnDate : ''}`;
  return `${TIER_ICON[d.tier] || ''} ${d.origin}→${d.destination} ${airportCity(d.destination, lang)} ${nt(d.priceTWD)}${disc}\n   ${airlineName(d.primaryCarrier, lang)} · ${stops} · ${dates}`;
}

export function formatDigest(deals, siteUrl, lang = 'zh-TW') {
  const s = L[langOf(lang)];
  return `${s.header(deals.length)}\n\n${deals.map((d) => dealLine(d, lang)).join('\n')}${siteUrl ? `\n\n${siteUrl}` : ''}`;
}

export function formatAlert(hits, lang = 'zh-TW') {
  const s = L[langOf(lang)];
  return hits.map(({ deal, maxTWD }) => `${s.alert(`${deal.origin}→${deal.destination}`, nt(deal.priceTWD), nt(maxTWD))}\n${dealLine(deal, lang)}`).join('\n\n');
}

// RFC 2047 lets ntfy show Chinese / Korean titles in HTTP headers.
const rfc2047 = (text) => `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;

async function publish(sub, { title, body, tags, priority, siteUrl }, { env, fetchImpl }) {
  const server = (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
  const headers = { Title: rfc2047(title), Tags: tags, Priority: priority };
  if (siteUrl) {
    headers.Click = siteUrl;
    headers.Actions = rfc2047(`view, ${L[sub.lang].open}, ${siteUrl}`);
  }
  if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
  const res = await fetchImpl(`${server}/${encodeURIComponent(sub.topic)}`, { method: 'POST', headers, body });
  return `${sub.name}:${res.status}`;
}

/**
 * @param {object[]} digestDeals  new strong deals for everyone
 * @param {Map<string, {deal, maxTWD}[]>} alertHits  personal target hits keyed by subscriber name ('all' = everyone)
 */
export async function sendNotifications(digestDeals, alertHits = new Map(), { env = process.env, siteUrl, fetchImpl = fetch } = {}) {
  const subs = parseSubscribers(env.NTFY_TOPICS || env.NTFY_TOPIC);
  const sent = [];
  for (const sub of subs) {
    const mine = [...(alertHits.get(sub.name) || []), ...(alertHits.get('all') || [])];
    if (mine.length) {
      sent.push(await publish(sub, { title: L[sub.lang].alertTitle, body: formatAlert(mine, sub.lang), tags: 'dart,airplane', priority: 'high', siteUrl }, { env, fetchImpl }));
    }
    if (digestDeals.length) {
      const priority = digestDeals.some((d) => d.tier === 'hot') ? 'high' : 'default';
      sent.push(await publish(sub, { title: L[sub.lang].title, body: formatDigest(digestDeals, siteUrl, sub.lang), tags: 'airplane', priority, siteUrl }, { env, fetchImpl }));
    }
  }
  return sent;
}
