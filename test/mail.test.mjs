import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { parseRecipients, parseAddress, buildMime, smtpSend, mailTransport, parseSmtpUrls } from '../scripts/lib/mail.mjs';

test('parseRecipients: names, languages, bare addresses, junk dropped', () => {
  assert.deepEqual(parseRecipients('sean=me@naver.com#zh-TW, Blue=blue@gmail.com#en'), [
    { name: 'sean', email: 'me@naver.com', lang: 'zh-TW' },
    { name: 'blue', email: 'blue@gmail.com', lang: 'en' },
  ]);
  assert.deepEqual(parseRecipients('solo@x.com'), [{ name: 'subscriber1', email: 'solo@x.com', lang: 'zh-TW' }]);
  assert.equal(parseRecipients('x=not-an-email, y=a@b.co#ko')[0].lang, 'ko');
  assert.deepEqual(parseRecipients(''), []);
});

test('buildMime: UTF-8 subject and display name, text + HTML parts', () => {
  const mime = buildMime({ from: 'ÆtherSky <me@gmail.com>', to: 'a@b.com', subject: '降價 NT$7,000', text: '你好', html: '<b>你好</b>' });
  assert.match(mime, /^From: =\?UTF-8\?B\?[^?]+\?= <me@gmail\.com>\r\n/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?[^?]+\?=/);
  assert.match(mime, /multipart\/alternative/);
  assert.equal((mime.match(/Content-Transfer-Encoding: base64/g) || []).length, 2);
  assert.deepEqual(parseAddress('"Sky" <x@y.z>'), { name: 'Sky', address: 'x@y.z' });
});

// Tiny fake SMTP server: records the conversation, supports AUTH PLAIN or LOGIN.
function fakeSmtp({ auth = 'PLAIN LOGIN', failRcpt = false } = {}) {
  const log = { commands: [], data: '' };
  const server = net.createServer((sock) => {
    let buf = '';
    let inData = false;
    let loginStep = 0;
    sock.write('220 fake.smtp ready\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            sock.write('250 queued\r\n');
          } else log.data += `${line}\n`;
          continue;
        }
        log.commands.push(line);
        if (loginStep === 1) { loginStep = 2; sock.write('334 UGFzc3dvcmQ6\r\n'); continue; }
        if (loginStep === 2) { loginStep = 0; sock.write('235 ok\r\n'); continue; }
        if (/^EHLO/.test(line)) sock.write(`250-fake.smtp\r\n250-AUTH ${auth}\r\n250 SIZE 1000000\r\n`);
        else if (/^AUTH PLAIN/.test(line)) sock.write('235 ok\r\n');
        else if (/^AUTH LOGIN/.test(line)) { loginStep = 1; sock.write('334 VXNlcm5hbWU6\r\n'); }
        else if (/^MAIL FROM/.test(line)) sock.write('250 ok\r\n');
        else if (/^RCPT TO/.test(line)) sock.write(failRcpt ? '550 no such user\r\n' : '250 ok\r\n');
        else if (line === 'DATA') { inData = true; sock.write('354 go\r\n'); }
        else if (line === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('500 ?\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, log, port: server.address().port })));
}

test('smtpSend: AUTH PLAIN, envelope, message delivered', async () => {
  const { server, log, port } = await fakeSmtp();
  try {
    await smtpSend(`smtp://me%40x.com:app%20pw@127.0.0.1:${port}`, { from: 'ÆtherSky <me@x.com>', to: 'sean@x.com', subject: 'Hi', text: 'hello', html: '<p>hello</p>' });
    const plain = Buffer.from(log.commands.find((c) => c.startsWith('AUTH PLAIN')).slice(11), 'base64').toString();
    assert.equal(plain, '\0me@x.com\0app pw');
    assert.ok(log.commands.includes('MAIL FROM:<me@x.com>'));
    assert.ok(log.commands.includes('RCPT TO:<sean@x.com>'));
    assert.match(log.data, /^From: /);
    assert.match(log.data, /To: sean@x\.com/);
  } finally {
    server.close();
  }
});

test('smtpSend: AUTH LOGIN fallback and a clear error on rejected recipient', async () => {
  const { server, log, port } = await fakeSmtp({ auth: 'LOGIN' });
  try {
    await smtpSend(`smtp://u:p@127.0.0.1:${port}`, { to: 'a@b.com', subject: 's', text: 't' });
    assert.ok(log.commands.includes('AUTH LOGIN'));
    assert.ok(log.commands.includes(Buffer.from('u').toString('base64')));
  } finally {
    server.close();
  }
  const bad = await fakeSmtp({ failRcpt: true });
  try {
    await assert.rejects(smtpSend(`smtp://u:p@127.0.0.1:${bad.port}`, { to: 'nobody@b.com', subject: 's', text: 't' }), /SMTP RCPT failed: 550/);
  } finally {
    bad.server.close();
  }
});

test('mailTransport: SMTP first, then Resend, otherwise none', () => {
  assert.equal(mailTransport({ SMTP_URL: 'smtps://a%40b.com:x@smtp.gmail.com:465', RESEND_API_KEY: 'r' }).name, 'smtp');
  assert.equal(mailTransport({ RESEND_API_KEY: 'r' }).name, 'resend');
  assert.equal(mailTransport({}), null);
});

test('parseSmtpUrls: several comma / newline separated accounts, junk dropped', () => {
  const a = 'smtps://a%40gmail.com:pw1@smtp.gmail.com:465';
  const b = 'smtps://b%40gmail.com:pw2@smtp.gmail.com:465';
  assert.deepEqual(parseSmtpUrls(`${a},${b}`), [a, b]);
  assert.deepEqual(parseSmtpUrls(` ${a} ,\n${b} `), [a, b]);
  assert.deepEqual(parseSmtpUrls('not-a-url'), []);
  assert.deepEqual(parseSmtpUrls(''), []);
});

test('mailTransport: comma-separated SMTP_URL fails over to the next account', async () => {
  const good = await fakeSmtp();
  const bad = await fakeSmtp({ failRcpt: true });
  try {
    const env = { SMTP_URL: `smtp://a%40x.com:p1@127.0.0.1:${bad.port},smtp://b%40x.com:p2@127.0.0.1:${good.port}` };
    const t = mailTransport(env);
    assert.equal(t.name, 'smtp');
    await t.send({ to: 'sean@x.com', subject: 's', text: 't' });
    assert.ok(good.log.commands.includes('MAIL FROM:<b@x.com>'), 'second account delivered');
    assert.match(good.log.data, /From: .*<b@x\.com>/);

    // Both failing → one error naming accounts by position, never by address.
    await assert.rejects(
      mailTransport({ SMTP_URL: `smtp://a%40x.com:p@127.0.0.1:${bad.port},smtp://b%40x.com:p@127.0.0.1:${bad.port}` }).send({ to: 'nobody@x.com', subject: 's', text: 't' }),
      (e) => /account #1/.test(e.message) && /account #2/.test(e.message) && !/@x\.com:/.test(e.message),
    );
  } finally {
    good.server.close();
    bad.server.close();
  }
});
