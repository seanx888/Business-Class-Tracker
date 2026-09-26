// Optional daily push of the best NEW deals — Telegram bot and/or ntfy.sh (both free).
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID    → Telegram message
//   NTFY_TOPIC (+ optional NTFY_SERVER)      → ntfy push (iOS / Android app, no signup)
import { airlineName } from '../web/core/airlines.js';
import { airportCity } from '../web/core/airports.js';

const TIER_ICON = { hot: '🔥', great: '⭐', good: '👍', fair: '·' };
const nt = (n) => 'NT$' + Math.round(n).toLocaleString('en-US');

export function formatDigest(deals, siteUrl) {
  const lines = deals.map((d) => {
    const route = `${d.origin}→${d.destination}`;
    const city = airportCity(d.destination, 'zh');
    const disc = d.discountPct != null && d.discountPct > 0 ? ` ▼${d.discountPct}%` : '';
    const stops = d.stops === 0 ? '直飛' : `${d.stops}轉`;
    return `${TIER_ICON[d.tier] || ''} ${route} ${city} ${nt(d.priceTWD)}${disc}\n   ${airlineName(d.primaryCarrier, 'zh')} · ${stops} · ${d.departDate}${d.returnDate ? '~' + d.returnDate : ''}`;
  });
  return `✈️ 商務艙好價 Business Class Deals (${deals.length})\n\n${lines.join('\n')}${siteUrl ? `\n\n${siteUrl}` : ''}`;
}

export async function sendNotifications(deals, { env = process.env, siteUrl, fetchImpl = fetch } = {}) {
  if (!deals.length) return [];
  const text = formatDigest(deals, siteUrl);
  const sent = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const res = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
    sent.push(`telegram:${res.status}`);
  }
  if (env.NTFY_TOPIC) {
    const server = env.NTFY_SERVER || 'https://ntfy.sh';
    const headers = { Title: 'Business Class Deals', Tags: 'airplane', Priority: deals.some((d) => d.tier === 'hot') ? 'high' : 'default' };
    if (siteUrl) headers.Click = siteUrl;
    const res = await fetchImpl(`${server}/${encodeURIComponent(env.NTFY_TOPIC)}`, { method: 'POST', headers, body: text });
    sent.push(`ntfy:${res.status}`);
  }
  return sent;
}
