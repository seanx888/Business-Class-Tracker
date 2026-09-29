// Real Tracker alerts — Google-Flights-style e-mails (ALERT_EMAILS + SMTP_URL / RESEND_API_KEY)
// and ntfy pushes (NTFY_TOPICS), each in the recipient's language.
import { airlineName } from '../web/core/airlines.js';
import { airportCity } from '../web/core/airports.js';
import { googleFlightsUrl } from '../web/core/links.js';
import { parseSubscribers } from './notify.mjs';
import { parseRecipients, mailTransport } from './lib/mail.mjs';

const nt = (n) => 'NT$' + Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LOCALE = { 'zh-TW': 'zh-TW', en: 'en-US', ko: 'ko-KR' };
const fmtDay = (iso, lang) => new Intl.DateTimeFormat(LOCALE[lang], { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

const L = {
  'zh-TW': {
    brand: 'ÆtherSky 航線追蹤',
    subject: {
      start: (r, p) => `開始追蹤 ${r}：目前最低 ${p}`,
      drop: (r, p, d) => `▼ 降價 ${d}：${r} 現在 ${p}`,
      dates: (r, p, d) => `▼ 找到更便宜的日期（省 ${d}）：${r} ${p}`,
      rise: (r, p, d) => `▲ 漲價 ${d}：${r} 現在 ${p}`,
      target: (r, p) => `🎯 達到目標價：${r} ${p}`,
    },
    lead: {
      start: '已開始每天追蹤這個行程，價格有明顯變化時會通知你。',
      drop: '你追蹤的航班降價了。',
      dates: '彈性日期範圍內找到更便宜的日期。',
      rise: '你追蹤的航班漲價了。',
      target: '已達到你設定的目標價！',
    },
    now: '目前最低', was: '先前', change: '變化', dates: '日期', flex: (n) => `±${n} 天彈性`, carrier: '航空公司', stops: '轉機',
    nonstop: '直飛', nStops: (n) => `${n} 轉`, target: '目標價', low: '追蹤以來最低', typical: 'Google 常見價', level: { low: '偏低', typical: '一般', high: '偏高' },
    lowBadge: '追蹤以來最低價', open: '在 Google Flights 查看', app: '開啟 ÆtherSky', ow: '單程',
    cabin: { business: '商務艙', first: '頭等艙', premium: '豪華經濟艙', economy: '經濟艙' },
    footer: '價格為搜尋當下的參考價，訂票前請再確認。已排除中國大陸／香港／澳門航空公司與轉機。要停止通知，請在 App 的「航線追蹤」暫停或刪除此追蹤。',
  },
  en: {
    brand: 'ÆtherSky Price Tracker',
    subject: {
      start: (r, p) => `Now tracking ${r}: lowest ${p}`,
      drop: (r, p, d) => `▼ Price dropped ${d}: ${r} now ${p}`,
      dates: (r, p, d) => `▼ Cheaper dates found (save ${d}): ${r} ${p}`,
      rise: (r, p, d) => `▲ Price up ${d}: ${r} now ${p}`,
      target: (r, p) => `🎯 Target price reached: ${r} ${p}`,
    },
    lead: {
      start: 'This trip is now checked every day. You will hear from us when the price changes significantly.',
      drop: 'The price of a trip you track has dropped.',
      dates: 'Cheaper dates were found within your flexible window.',
      rise: 'The price of a trip you track went up.',
      target: 'Your target price has been reached!',
    },
    now: 'Lowest now', was: 'Before', change: 'Change', dates: 'Dates', flex: (n) => `±${n} days flexible`, carrier: 'Airline', stops: 'Stops',
    nonstop: 'Nonstop', nStops: (n) => `${n} stop${n > 1 ? 's' : ''}`, target: 'Target', low: 'Lowest since tracking', typical: 'Google typical', level: { low: 'low', typical: 'typical', high: 'high' },
    lowBadge: 'Lowest since tracking', open: 'View on Google Flights', app: 'Open ÆtherSky', ow: 'One way',
    cabin: { business: 'Business', first: 'First', premium: 'Premium economy', economy: 'Economy' },
    footer: 'Prices are snapshots at search time — confirm before booking. China / Hong Kong / Macau carriers and connections are excluded. To stop these e-mails, pause or delete the tracker in the app (Routes → Real Tracker).',
  },
  ko: {
    brand: 'ÆtherSky 가격 추적',
    subject: {
      start: (r, p) => `${r} 추적 시작: 현재 최저 ${p}`,
      drop: (r, p, d) => `▼ ${d} 인하: ${r} 현재 ${p}`,
      dates: (r, p, d) => `▼ 더 저렴한 날짜 발견 (${d} 절약): ${r} ${p}`,
      rise: (r, p, d) => `▲ ${d} 인상: ${r} 현재 ${p}`,
      target: (r, p) => `🎯 목표가 도달: ${r} ${p}`,
    },
    lead: {
      start: '이 일정을 매일 확인합니다. 가격이 크게 바뀌면 알려 드립니다.',
      drop: '추적 중인 항공권 가격이 내려갔습니다.',
      dates: '유연한 날짜 범위에서 더 저렴한 날짜를 찾았습니다.',
      rise: '추적 중인 항공권 가격이 올랐습니다.',
      target: '설정한 목표가에 도달했습니다!',
    },
    now: '현재 최저', was: '이전', change: '변동', dates: '날짜', flex: (n) => `±${n}일 유연`, carrier: '항공사', stops: '경유',
    nonstop: '직항', nStops: (n) => `${n}회 경유`, target: '목표가', low: '추적 이후 최저', typical: 'Google 평균가', level: { low: '낮음', typical: '보통', high: '높음' },
    lowBadge: '추적 이후 최저가', open: 'Google Flights에서 보기', app: 'ÆtherSky 열기', ow: '편도',
    cabin: { business: '비즈니스', first: '퍼스트', premium: '프리미엄 이코노미', economy: '이코노미' },
    footer: '가격은 검색 시점의 참고 가격입니다. 예약 전 다시 확인하세요. 중국 본토·홍콩·마카오 항공사와 경유는 제외됩니다. 알림을 멈추려면 앱의 노선 추적에서 이 추적을 일시 중지하거나 삭제하세요.',
  },
};
const langOf = (l) => (L[l] ? l : 'zh-TW');

function facts(a, lang) {
  const s = L[langOf(lang)];
  const { tracker: t, best, prev } = a;
  const route = `${airportCity(t.o, lang)} → ${airportCity(t.d, lang)}`;
  const dates = best.ret ? `${fmtDay(best.dep, lang)} – ${fmtDay(best.ret, lang)}` : `${fmtDay(best.dep, lang)} · ${s.ow}`;
  const delta = prev ? best.p - prev.p : 0;
  const url = googleFlightsUrl({ origin: t.o, destination: t.d, departDate: best.dep, returnDate: best.ret, lang, cabin: t.cabin });
  return { s, route, dates, delta, url };
}

/** Subject + plain text + HTML for one alert in one language. */
export function formatTrackerAlert(a, lang = 'zh-TW', siteUrl = null) {
  const { s, route, dates, delta, url } = facts(a, lang);
  const { tracker: t, best, prev, low } = a;
  const price = nt(best.p);
  const d = nt(Math.abs(delta));
  const subject = `${s.subject[a.kind](`${t.o}→${t.d}`, price, d)}${t.label ? ` · ${t.label}` : ''}`;
  const rows = [
    [s.dates, `${dates}${t.mode === 'flex' ? ` (${s.flex(t.flex)})` : ''}`],
    [s.carrier, `${airlineName(best.c, lang)} · ${best.s === 0 ? s.nonstop : s.nStops(best.s)}${best.via?.length ? ` (${best.via.join(', ')})` : ''} · ${s.cabin[t.cabin] || t.cabin}`],
  ];
  if (prev && a.kind !== 'start') rows.push([s.was, `${nt(prev.p)} → ${price} (${delta < 0 ? '−' : '+'}${d})`]);
  if (t.target) rows.push([s.target, nt(t.target)]);
  if (low && low.p < best.p) rows.push([s.low, nt(low.p)]);
  if (best.typ) rows.push([s.typical, `${nt(best.typ[0])}–${nt(best.typ[1])}${best.lvl && s.level[best.lvl] ? ` · ${s.level[best.lvl]}` : ''}`]);
  if (best.fl?.length) rows.push(['✈', best.fl.join(' / ')]);

  const text = [
    s.lead[a.kind],
    '',
    `${route}${t.label ? ` · ${t.label}` : ''}`,
    `${s.now}: ${price}${a.isLow ? ` (${s.lowBadge})` : ''}`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `${s.open}: ${url}`,
    ...(siteUrl ? [`${s.app}: ${siteUrl}#routes`] : []),
    '',
    s.footer,
  ].join('\n');

  const color = a.kind === 'rise' ? '#b91c1c' : '#047857';
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Apple SD Gothic Neo',Roboto,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:20px 24px 0;font-size:13px;color:#475569;font-weight:600;letter-spacing:.02em">${esc(s.brand)}</td></tr>
<tr><td style="padding:8px 24px 0;font-size:15px;color:#475569">${esc(s.lead[a.kind])}</td></tr>
<tr><td style="padding:16px 24px 0"><div style="font-size:20px;font-weight:700">${esc(route)}</div>${t.label ? `<div style="font-size:14px;color:#475569">${esc(t.label)}</div>` : ''}</td></tr>
<tr><td style="padding:12px 24px 0"><span style="font-size:13px;color:#475569">${esc(s.now)}</span><br><span style="font-size:30px;font-weight:700;letter-spacing:-.02em;color:${a.kind === 'start' ? '#0f172a' : color}">${esc(price)}</span>${prev && a.kind !== 'start' ? `<span style="font-size:15px;font-weight:600;color:${color};margin-left:8px">${delta < 0 ? '▼' : '▲'} ${esc(d)}</span>` : ''}${a.isLow ? `<div style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:6px;background:#ecfdf5;color:#047857;font-size:12px;font-weight:600">${esc(s.lowBadge)}</div>` : ''}</td></tr>
<tr><td style="padding:16px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#475569;border-top:1px solid #f1f5f9;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0 6px 16px;text-align:right;border-top:1px solid #f1f5f9">${esc(v)}</td></tr>`).join('')}</table></td></tr>
<tr><td style="padding:20px 24px 0"><a href="${esc(url)}" style="display:block;text-align:center;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:600;border-radius:8px;padding:12px 16px">${esc(s.open)}</a>${siteUrl ? `<a href="${esc(siteUrl)}#routes" style="display:block;text-align:center;color:#1e3a8a;text-decoration:none;font-weight:600;padding:12px 16px">${esc(s.app)}</a>` : ''}</td></tr>
<tr><td style="padding:12px 24px 20px;font-size:12px;color:#64748b;line-height:1.5">${esc(s.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html, url };
}

const wants = (tracker, name) => tracker.notify === 'all' || ['all', 'family'].includes(name) || (Array.isArray(tracker.notify) && tracker.notify.includes(name));

// RFC 2047 so ntfy shows Chinese / Korean titles from HTTP headers.
const rfc2047 = (text) => `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;

/**
 * Deliver alerts on every configured channel. Returns a list like ['mail:usera', 'ntfy:family:200'].
 * One failing recipient never blocks the others.
 */
export async function sendTrackerAlerts(alerts, { env = process.env, siteUrl = null, fetchImpl = fetch, transport = mailTransport(env, fetchImpl), log = () => {} } = {}) {
  const sent = [];
  if (!alerts.length) return sent;
  const recipients = parseRecipients(env.ALERT_EMAILS);
  if (transport) {
    for (const r of recipients) {
      for (const a of alerts.filter((x) => wants(x.tracker, r.name))) {
        const m = formatTrackerAlert(a, r.lang, siteUrl);
        try {
          await transport.send({ to: r.email, subject: m.subject, text: m.text, html: m.html });
          sent.push(`mail:${r.name}`);
        } catch (e) {
          log(`✗ tracker e-mail to ${r.name} failed: ${e.message}`);
        }
      }
    }
  }
  const server = (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
  for (const sub of parseSubscribers(env.NTFY_TOPICS || env.NTFY_TOPIC)) {
    for (const a of alerts.filter((x) => wants(x.tracker, sub.name))) {
      const m = formatTrackerAlert(a, sub.lang, siteUrl);
      const headers = { Title: rfc2047(m.subject), Tags: a.kind === 'rise' ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend,airplane', Priority: a.kind === 'target' || a.kind === 'drop' || a.kind === 'dates' ? 'high' : 'default', Click: m.url };
      if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
      try {
        const res = await fetchImpl(`${server}/${encodeURIComponent(sub.topic)}`, { method: 'POST', headers, body: m.text });
        sent.push(`ntfy:${sub.name}:${res.status}`);
      } catch (e) {
        log(`✗ tracker push to ${sub.name} failed: ${e.message}`);
      }
    }
  }
  return sent;
}
