// E-mail for Real Tracker alerts (like Google Flights' price e-mails). No dependencies.
//
//   ALERT_EMAILS (secret)  who gets mail:  sean=me@naver.com#zh-TW, blue=blue@gmail.com#en
//   SMTP_URL (secret)      any SMTP server with an app password, e.g.
//                          smtps://me%40gmail.com:app-password@smtp.gmail.com:465
//                          smtps://me%40naver.com:app-password@smtp.naver.com:465
//   RESEND_API_KEY         alternative to SMTP (https://resend.com) — needs a verified domain to mail others
//   MAIL_FROM              optional sender, e.g. "ÆtherSky <me@gmail.com>" (default: the SMTP user)
import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const LANGS = ['zh-TW', 'en', 'ko'];
const langOf = (l) => (LANGS.includes(l) ? l : String(l || '').startsWith('ko') ? 'ko' : String(l || '').startsWith('en') ? 'en' : 'zh-TW');

/** `name=email#lang, …` → [{ name, email, lang }] (a bare address becomes subscriberN). */
export function parseRecipients(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const [left, lang] = entry.split('#');
      const eq = left.indexOf('=');
      const name = eq > 0 ? left.slice(0, eq).trim().toLowerCase() : `subscriber${i + 1}`;
      const email = (eq > 0 ? left.slice(eq + 1) : left).trim();
      return { name, email, lang: langOf((lang || 'zh-TW').trim()) };
    })
    .filter((r) => EMAIL.test(r.email));
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const wrap76 = (s) => s.replace(/.{1,76}/g, (m) => `${m}\r\n`);
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** "Name <addr>" → { name, address } */
export function parseAddress(s) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(String(s || ''));
  return m ? { name: m[1].replace(/^"|"$/g, ''), address: m[2].trim() } : { name: '', address: String(s || '').trim() };
}
const formatAddress = ({ name, address }) => (name ? `${encodeWord(name)} <${address}>` : address);

/** RFC 5322 message, multipart/alternative (text + HTML), UTF-8 base64 bodies. */
export function buildMime({ from, to, subject, text, html, date = new Date() }) {
  const boundary = `aether-${randomUUID()}`;
  const fromAddr = parseAddress(from);
  const domain = fromAddr.address.split('@')[1] || 'aethersky.app';
  const headers = [
    `From: ${formatAddress(fromAddr)}`,
    `To: ${to}`,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type, body) => `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(body))}`;
  return `${headers.join('\r\n')}\r\n\r\n${part('text/plain', text || '')}${html ? part('text/html', html) : ''}--${boundary}--\r\n`;
}

// Minimal line-oriented SMTP conversation over a (possibly upgraded) socket.
class SmtpConn {
  constructor(socket, timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.buf = '';
    this.lines = [];
    this.waiters = [];
    this.attach(socket);
  }

  attach(socket) {
    this.detach();
    this.socket = socket;
    socket.on('data', (chunk) => {
      this.buf += chunk.toString('utf8');
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        this.lines.push(this.buf.slice(0, i).replace(/\r$/, ''));
        this.buf = this.buf.slice(i + 1);
      }
      this.flush();
    });
    socket.on('error', (e) => this.fail(e));
    socket.on('close', () => this.fail(new Error('SMTP connection closed')));
  }

  // Stop listening before the socket is handed to TLS (STARTTLS).
  detach() {
    if (!this.socket) return;
    this.socket.removeAllListeners('data');
    this.socket.removeAllListeners('error');
    this.socket.removeAllListeners('close');
  }

  fail(err) {
    this.error ||= err;
    for (const w of this.waiters.splice(0)) w.reject(err);
  }

  flush() {
    while (this.waiters.length) {
      const end = this.lines.findIndex((l) => /^\d{3}(?: |$)/.test(l));
      if (end < 0) return;
      const lines = this.lines.splice(0, end + 1);
      const code = Number(lines[end].slice(0, 3));
      this.waiters.shift().resolve({ code, lines: lines.map((l) => l.slice(4)) });
    }
  }

  read() {
    return new Promise((resolve, reject) => {
      if (this.error) return reject(this.error);
      const timer = setTimeout(() => reject(new Error('SMTP timeout')), this.timeoutMs);
      this.waiters.push({ resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) });
      this.flush();
    });
  }

  async cmd(line, expect, label = line.split(' ')[0]) {
    if (line != null) this.socket.write(`${line}\r\n`);
    const res = await this.read();
    if (!expect.includes(res.code)) throw new Error(`SMTP ${label} failed: ${res.code} ${res.lines.join(' ').slice(0, 200)}`);
    return res;
  }
}

function connect(url, tlsOptions) {
  const secure = url.protocol === 'smtps:';
  const port = Number(url.port) || (secure ? 465 : 587);
  const host = url.hostname;
  return new Promise((resolve, reject) => {
    const s = secure ? tls.connect({ host, port, servername: host, ...tlsOptions }) : net.connect({ host, port });
    s.once(secure ? 'secureConnect' : 'connect', () => resolve(s));
    s.once('error', reject);
  });
}

/**
 * Send one message through SMTP. smtps:// = implicit TLS (465); smtp:// = STARTTLS (587), which is
 * required unless the host is local (used by tests).
 */
export async function smtpSend(smtpUrl, { from, to, subject, text, html }, { timeoutMs = 30000, tlsOptions = {}, clientName = 'aethersky.local' } = {}) {
  const url = new URL(smtpUrl);
  const user = decodeURIComponent(url.username);
  const pass = decodeURIComponent(url.password);
  const sender = parseAddress(from || user).address;
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  const conn = new SmtpConn(await connect(url, tlsOptions), timeoutMs);
  try {
    await conn.cmd(null, [220], 'greeting');
    let ehlo = await conn.cmd(`EHLO ${clientName}`, [250]);
    if (url.protocol === 'smtp:') {
      if (ehlo.lines.some((l) => /^STARTTLS\b/i.test(l))) {
        await conn.cmd('STARTTLS', [220]);
        conn.detach();
        const secured = tls.connect({ socket: conn.socket, servername: url.hostname, ...tlsOptions });
        await new Promise((resolve, reject) => secured.once('secureConnect', resolve).once('error', reject));
        conn.attach(secured);
        ehlo = await conn.cmd(`EHLO ${clientName}`, [250]);
      } else if (!local) {
        throw new Error('SMTP server does not offer STARTTLS — use smtps:// (port 465)');
      }
    }
    if (user) {
      const auth = ehlo.lines.find((l) => /^AUTH\b/i.test(l)) || '';
      if (/\bPLAIN\b/i.test(auth) || !/\bLOGIN\b/i.test(auth)) {
        await conn.cmd(`AUTH PLAIN ${b64(`\0${user}\0${pass}`)}`, [235], 'AUTH');
      } else {
        await conn.cmd('AUTH LOGIN', [334], 'AUTH');
        await conn.cmd(b64(user), [334], 'AUTH');
        await conn.cmd(b64(pass), [235], 'AUTH');
      }
    }
    await conn.cmd(`MAIL FROM:<${sender}>`, [250]);
    await conn.cmd(`RCPT TO:<${to}>`, [250, 251]);
    await conn.cmd('DATA', [354]);
    // Base64 bodies never start a line with '.', but stuff dots anyway to be safe.
    const body = buildMime({ from: from || user, to, subject, text, html }).replace(/\r\n\./g, '\r\n..');
    await conn.cmd(`${body}.`, [250], 'DATA body');
    conn.socket.write('QUIT\r\n');
  } finally {
    setTimeout(() => conn.socket.destroy(), 50).unref?.();
  }
}

/** Pick the configured transport (SMTP_URL wins over RESEND_API_KEY), or null when mail is not set up. */
export function mailTransport(env = process.env, fetchImpl = fetch) {
  if (env.SMTP_URL) {
    const from = env.MAIL_FROM || `ÆtherSky <${decodeURIComponent(new URL(env.SMTP_URL).username)}>`;
    return { name: 'smtp', send: (m) => smtpSend(env.SMTP_URL, { from, ...m }) };
  }
  if (env.RESEND_API_KEY) {
    const from = env.MAIL_FROM || 'ÆtherSky <onboarding@resend.dev>';
    return {
      name: 'resend',
      send: async ({ to, subject, text, html }) => {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text, html }),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      },
    };
  }
  return null;
}
