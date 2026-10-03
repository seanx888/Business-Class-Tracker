// Push / e-mail digest of NEW community deals and promotions (a status match, a mistake fare, a sale on an airline you fly …).
//
// Channels are the ones Real Tracker already uses: ALERT_EMAILS + SMTP_URL / RESEND_API_KEY, and NTFY_TOPICS (each person in their own language).
// Who hears about what: by default everyone gets the strongest new items. A private repository variable narrows that per person:
//   PROMO_ALERTS = [{"who":"usera","brands":["DL","MARRIOTT"],"kinds":["status-match","bonus-miles"],"minRelevance":45,"deals":false}]
// A person with an entry gets only what matches it; "brands" are wallet program keys or airline codes (docs/SETUP.md).
import { parseSubscribers } from './notify.mjs';
import { parseRecipients, mailTransport } from './lib/mail.mjs';
import { placeLabel } from '../web/core/places.js';
import { usableFromTaiwan } from '../web/core/promos.js';
import { PROGRAMS, programName } from '../web/core/programs.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MAX_EACH = 4;

const L = {
  'zh-TW': {
    brand: 'ÆtherSky 好價與活動', deals: '社群好價', promos: '航空 / 飯店活動', until: (d) => `截止 ${d}`, open: '開啟 ÆtherSky', source: '來源',
    subject: (nd, np) => `新情報：${nd ? `${nd} 則好價` : ''}${nd && np ? '、' : ''}${np ? `${np} 則活動` : ''}`,
    kind: { 'error-fare': '疑似錯誤票價', 'ex-station': '外站票', 'multi-city': '多段票', interline: '聯運', stopover: '停留', 'hidden-city': '甩尾票', sale: '特價',
      'status-match': '會籍 Match', 'route-promo': '航線促銷', 'fare-sale': '票價折扣', 'bonus-miles': '里程加碼', 'award-sale': '兌換優惠' },
    cabin: { business: '商務艙', first: '頭等艙', premium: '豪華經濟艙', economy: '經濟艙' },
    footer: '資料來自公開的 RSS / 論壇，僅供參考；購買前請回原文確認條件、期限與適用地區。已排除中國大陸／香港／澳門。要調整通知內容，請設定 PROMO_ALERTS（見 docs/SETUP.md）。',
  },
  en: {
    brand: 'ÆtherSky deals & promotions', deals: 'Community deals', promos: 'Airline / hotel promotions', until: (d) => `until ${d}`, open: 'Open ÆtherSky', source: 'Source',
    subject: (nd, np) => `New: ${nd ? `${nd} deal${nd > 1 ? 's' : ''}` : ''}${nd && np ? ' · ' : ''}${np ? `${np} promotion${np > 1 ? 's' : ''}` : ''}`,
    kind: { 'error-fare': 'possible error fare', 'ex-station': 'ex-station', 'multi-city': 'multi-city', interline: 'interline', stopover: 'stopover', 'hidden-city': 'hidden-city', sale: 'sale',
      'status-match': 'status match', 'route-promo': 'route promo', 'fare-sale': 'fare sale', 'bonus-miles': 'bonus miles', 'award-sale': 'award sale' },
    cabin: { business: 'business', first: 'first', premium: 'premium economy', economy: 'economy' },
    footer: 'Taken from public RSS feeds and forums — indicative only; check the original post for conditions, deadline and eligible countries before buying. Mainland China / Hong Kong / Macau excluded. Narrow what you get with PROMO_ALERTS (docs/SETUP.md).',
  },
  ko: {
    brand: 'ÆtherSky 특가·프로모션', deals: '커뮤니티 특가', promos: '항공사 / 호텔 프로모션', until: (d) => `${d}까지`, open: 'ÆtherSky 열기', source: '출처',
    subject: (nd, np) => `새 소식: ${nd ? `특가 ${nd}건` : ''}${nd && np ? ' · ' : ''}${np ? `프로모션 ${np}건` : ''}`,
    kind: { 'error-fare': '오류 요금 가능성', 'ex-station': '외항발', 'multi-city': '다구간', interline: '연계 발권', stopover: '스톱오버', 'hidden-city': '히든시티', sale: '세일',
      'status-match': '등급 매치', 'route-promo': '노선 프로모션', 'fare-sale': '운임 할인', 'bonus-miles': '마일리지 보너스', 'award-sale': '보너스 항공권 할인' },
    cabin: { business: '비즈니스', first: '퍼스트', premium: '프리미엄 이코노미', economy: '이코노미' },
    footer: '공개 RSS·포럼에서 가져온 참고 정보입니다. 구매 전 원문에서 조건·기한·대상 국가를 확인하세요. 중국·홍콩·마카오는 제외됩니다. PROMO_ALERTS로 받을 내용을 조절할 수 있습니다(docs/SETUP.md).',
  },
};
const langOf = (l) => (L[l] ? l : 'zh-TW');
const nt = (n) => `NT$${Math.round(n).toLocaleString('en-US')}`;

/** [{ who, brands, kinds, minRelevance, deals }] from the PROMO_ALERTS variable; junk is ignored. */
export function parsePromoAlerts(value) {
  if (!value || !String(value).trim()) return [];
  try {
    const v = JSON.parse(value);
    return (Array.isArray(v) ? v : [v]).filter((x) => x && typeof x === 'object').map((x) => ({
      who: String(x.who || 'all').toLowerCase(),
      brands: [].concat(x.brands || []).map((b) => String(b).toUpperCase()),
      kinds: [].concat(x.kinds || []).map(String),
      minRelevance: Number(x.minRelevance) || null,
      deals: x.deals !== false,
    }));
  } catch {
    return [];
  }
}

const brandHit = (item, brands) => !brands.length || (item.brands || []).some((b) => brands.includes(String(b.program || '').toUpperCase()) || brands.includes(String(b.carrier || '').toUpperCase()) || brands.includes(String(b.id).toUpperCase()));

/** The default for people without an entry: the strongest new items. */
export function defaultPick({ newDeals, newPromos }) {
  const deals = newDeals.filter((d) => d.relevance >= 60 || (d.kinds.includes('error-fare') && d.relevance >= 45));
  const promos = newPromos.filter((p) => usableFromTaiwan(p.lock || []) && (p.relevance >= 55 || (p.kinds.includes('status-match') && p.relevance >= 45)));
  return { deals: deals.slice(0, MAX_EACH), promos: promos.slice(0, MAX_EACH) };
}

/** What one person's entry lets through. */
export function personalPick({ newDeals, newPromos }, entry) {
  const min = entry.minRelevance ?? 40;
  const promos = newPromos.filter((p) => p.relevance >= min && brandHit(p, entry.brands) && (!entry.kinds.length || p.kinds.some((k) => entry.kinds.includes(k))));
  const deals = entry.deals ? newDeals.filter((d) => d.relevance >= Math.max(min, 45) && (!entry.kinds.length || d.kinds.some((k) => entry.kinds.includes(k))) && (!entry.brands.length || (d.airlines || []).some((c) => entry.brands.includes(c)))) : [];
  return { deals: deals.slice(0, MAX_EACH), promos: promos.slice(0, MAX_EACH) };
}

const brandLabel = (b, lang) => (b.program && PROGRAMS[b.program] ? programName(b.program, lang) : b.id);

function lines(pick, lang) {
  const s = L[langOf(lang)];
  const out = [];
  for (const d of pick.deals) {
    const o = d.route?.o && placeLabel(d.route.o.code, lang);
    const t = d.route?.d && placeLabel(d.route.d.code, lang);
    const route = o || t ? `${o || '?'} → ${t || '?'}` : '';
    const price = d.price?.twd ? nt(d.price.twd) : d.price ? `${d.price.currency} ${d.price.amount}` : '';
    const tags = [d.cabin && s.cabin[d.cabin], ...d.kinds.filter((k) => k !== 'sale').map((k) => s.kind[k])].filter(Boolean).join(' · ');
    out.push({ icon: d.kinds.includes('error-fare') ? '🔥' : '✈️', head: [route, price].filter(Boolean).join(' ') || d.title, sub: [tags, d.title].filter(Boolean).join(' — '), url: d.url, src: d.src });
  }
  for (const p of pick.promos) {
    const brand = p.brands.slice(0, 2).map((b) => brandLabel(b, lang)).join(' / ');
    const tags = p.kinds.map((k) => s.kind[k]).join(' · ');
    out.push({ icon: p.kinds.includes('status-match') ? '🏅' : '🎁', head: `${brand}: ${tags}`, sub: `${p.title}${p.validTo ? ` (${s.until(p.validTo)})` : ''}`, url: p.url, src: p.src });
  }
  return out;
}

/** Subject + plain text + HTML for one person's digest. */
export function formatDigest(pick, lang = 'zh-TW', siteUrl = null) {
  const s = L[langOf(lang)];
  const items = lines(pick, lang);
  const subject = s.subject(pick.deals.length, pick.promos.length);
  const text = [
    ...items.flatMap((x) => [`${x.icon} ${x.head}`, `   ${x.sub}`, `   ${x.url}`]),
    '',
    ...(siteUrl ? [`${s.open}: ${siteUrl}#deals/community`, ''] : []),
    s.footer,
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Apple SD Gothic Neo',Roboto,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:20px 24px 4px;font-size:13px;color:#475569;font-weight:600">${esc(s.brand)}</td></tr>
${items.map((x) => `<tr><td style="padding:12px 24px 0"><div style="font-size:16px;font-weight:700">${x.icon} ${esc(x.head)}</div><div style="font-size:14px;color:#475569;margin-top:2px">${esc(x.sub)}</div><a href="${esc(x.url)}" style="font-size:14px;color:#1e3a8a">${esc(s.source)} ↗</a></td></tr>`).join('\n')}
${siteUrl ? `<tr><td style="padding:20px 24px 0"><a href="${esc(siteUrl)}#deals/community" style="display:block;text-align:center;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:600;border-radius:8px;padding:12px 16px">${esc(s.open)}</a></td></tr>` : ''}
<tr><td style="padding:12px 24px 20px;font-size:12px;color:#64748b;line-height:1.5">${esc(s.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html, items: items.length };
}

const rfc2047 = (text) => `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;

/**
 * Deliver the digest on every configured channel; returns ['mail:usera', 'ntfy:family:200'].
 * One failing recipient never blocks the others; nothing is sent when nothing qualifies.
 */
export async function sendCommunityDigest({ newDeals, newPromos }, { env = process.env, siteUrl = null, fetchImpl = fetch, transport = mailTransport(env, fetchImpl), log = () => {} } = {}) {
  const sent = [];
  const entries = parsePromoAlerts(env.PROMO_ALERTS);
  const pickFor = (name) => {
    const mine = entries.filter((e) => e.who === name || e.who === 'all');
    if (!mine.length) return defaultPick({ newDeals, newPromos });
    const merged = mine.map((e) => personalPick({ newDeals, newPromos }, e));
    const uniq = (xs) => [...new Map(xs.map((x) => [x.id, x])).values()].slice(0, MAX_EACH);
    return { deals: uniq(merged.flatMap((m) => m.deals)), promos: uniq(merged.flatMap((m) => m.promos)) };
  };
  const nothing = (p) => !p.deals.length && !p.promos.length;

  if (transport) {
    for (const r of parseRecipients(env.ALERT_EMAILS)) {
      const pick = pickFor(r.name);
      if (nothing(pick)) continue;
      const m = formatDigest(pick, r.lang, siteUrl);
      try {
        await transport.send({ to: r.email, subject: m.subject, text: m.text, html: m.html });
        sent.push(`mail:${r.name}`);
      } catch (e) {
        log(`✗ community e-mail to ${r.name} failed: ${e.message}`);
      }
    }
  }
  const server = (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
  for (const sub of parseSubscribers(env.NTFY_TOPICS || env.NTFY_TOPIC)) {
    const pick = pickFor(sub.name);
    if (nothing(pick)) continue;
    const m = formatDigest(pick, sub.lang, siteUrl);
    const headers = { Title: rfc2047(m.subject), Tags: 'gift,airplane', Priority: pick.deals.some((d) => d.kinds.includes('error-fare')) ? 'high' : 'default' };
    if (siteUrl) headers.Click = `${siteUrl}#deals/community`;
    if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
    try {
      const res = await fetchImpl(`${server}/${encodeURIComponent(sub.topic)}`, { method: 'POST', headers, body: m.text });
      sent.push(`ntfy:${sub.name}:${res.status}`);
    } catch (e) {
      log(`✗ community push to ${sub.name} failed: ${e.message}`);
    }
  }
  return sent;
}
