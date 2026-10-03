// RSS 2.0 / Atom reader without dependencies. Deal sites and forums all publish one of the two; we only need
// title, link, date, a text summary and the categories/tags. Anything unreadable is skipped, never thrown.
//
//   parseFeed(xml) → { title, items: [{ id, title, url, published, summary, categories, author }] }

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  euro: '€', pound: '£', yen: '¥', copy: '©', reg: '®', trade: '™', times: '×', bull: '•', middot: '·', laquo: '«', raquo: '»', eacute: 'é',
};

/** Decode &amp; … &#8211; … &#x1F334; (numeric references beyond the BMP included). Unknown names stay as they are. */
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]*));/gi, (m, dec, hex, name) => {
    try {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
    } catch {
      return m;
    }
    return NAMED[name.toLowerCase()] ?? m;
  });
}

const CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
const unCdata = (s) => s.replace(CDATA, '$1');

/** HTML → plain text: block tags become spaces, tags vanish, entities are decoded, whitespace collapses. */
export function htmlToText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|blockquote)>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

const escapeName = (n) => n.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');

/** Inner text of the first <name>…</name> (namespaces like dc:creator allowed); null when absent. */
function inner(block, name) {
  const re = new RegExp(`<${escapeName(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeName(name)}>`, 'i');
  const m = re.exec(block);
  return m ? m[1] : null;
}

function allInner(block, name) {
  const re = new RegExp(`<${escapeName(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeName(name)}>`, 'gi');
  return [...block.matchAll(re)].map((m) => m[1]);
}

/** Value of an attribute on the first <name … attr="…"> tag (self-closing or not). */
function attr(block, name, attribute, where = () => true) {
  const re = new RegExp(`<${escapeName(name)}\\s([^>]*?)/?>`, 'gi');
  for (const m of block.matchAll(re)) {
    if (!where(m[1])) continue;
    const a = new RegExp(`${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(m[1]);
    if (a) return decodeEntities(a[2] ?? a[3]);
  }
  return null;
}

function toDate(s) {
  if (!s) return null;
  const t = Date.parse(decodeEntities(unCdata(s)).trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Plain text of a field that may be CDATA, escaped HTML (Atom type="html") or plain text. */
function textOf(raw) {
  if (raw == null) return '';
  const hadCdata = raw.includes('<![CDATA[');
  const body = unCdata(raw);
  // Escaped HTML (&lt;p&gt;…) is decoded once to get the markup, then stripped; real CDATA already holds markup.
  return htmlToText(hadCdata ? body : decodeEntities(body));
}

/** Drop utm_* tracking parameters; anything that is not a valid URL is returned untouched. */
function stripTracking(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

function parseItem(block, atom) {
  const title = textOf(inner(block, 'title'));
  let url = null;
  if (atom) {
    url = attr(block, 'link', 'href', (a) => !/rel\s*=\s*["'](?!alternate)/i.test(a)) || attr(block, 'link', 'href');
  } else {
    const l = inner(block, 'link');
    url = l ? decodeEntities(unCdata(l)).trim() : null;
    if (!url) url = attr(block, 'link', 'href');
  }
  if (url) url = stripTracking(url);
  const id = decodeEntities(unCdata(inner(block, atom ? 'id' : 'guid') || '')).trim() || url || title;
  const body = inner(block, 'content:encoded') ?? inner(block, 'content') ?? inner(block, 'summary') ?? inner(block, 'description');
  const categories = [
    ...allInner(block, 'category').map((c) => textOf(c)),
    ...[...block.matchAll(/<category\s[^>]*?term\s*=\s*"([^"]*)"/gi)].map((m) => decodeEntities(m[1])),
  ].filter(Boolean);
  const author = textOf(inner(block, 'dc:creator') ?? inner(inner(block, 'author') || '', 'name') ?? inner(block, 'author') ?? '');
  return {
    id,
    title,
    url,
    published: toDate(inner(block, 'pubDate') ?? inner(block, 'published') ?? inner(block, 'dc:date') ?? inner(block, 'updated')),
    summary: textOf(body),
    categories: [...new Set(categories)],
    author: author || null,
  };
}

/** @returns {{ title: string, format: 'rss'|'atom'|'unknown', items: object[] }} */
export function parseFeed(xml, { max = 120 } = {}) {
  const s = String(xml ?? '');
  const isAtom = /<feed[\s>]/i.test(s) && /<entry[\s>]/i.test(s);
  const isRss = /<rss[\s>]|<rdf:RDF[\s>]|<channel[\s>]/i.test(s);
  const blocks = [...s.matchAll(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const head = s.slice(0, Math.max(0, s.search(isAtom ? /<entry[\s>]/i : /<item[\s>]/i)) || undefined);
  const items = [];
  for (const b of blocks.slice(0, max)) {
    try {
      const it = parseItem(b, isAtom);
      if (it.title && it.url) items.push(it);
    } catch {
      /* one broken item never costs the rest of the feed */
    }
  }
  return { title: textOf(inner(head, 'title')) || '', format: isAtom ? 'atom' : isRss ? 'rss' : 'unknown', items };
}
