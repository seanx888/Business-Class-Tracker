import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleFlightsUrl, skyscannerUrl, kayakUrl, searchLinks } from '../web/core/links.js';

const q = { origin: 'TPE', destination: 'CDG', departDate: '2026-11-10', returnDate: '2026-11-24', currency: 'TWD', lang: 'zh-TW' };

test('Google Flights link asks for business class round trip', () => {
  const u = new URL(googleFlightsUrl(q));
  assert.match(u.searchParams.get('q'), /from TPE to CDG on 2026-11-10 through 2026-11-24 business class/);
  assert.equal(u.searchParams.get('curr'), 'TWD');
  assert.match(new URL(googleFlightsUrl({ ...q, returnDate: null })).searchParams.get('q'), /one way/);
  assert.equal(u.searchParams.get('gl'), null);
});

test('Google Flights link can open another country market (foreign-site checkout)', () => {
  const u = new URL(googleFlightsUrl({ ...q, currency: 'VND', gl: 'vn' }));
  assert.equal(u.searchParams.get('gl'), 'VN');
  assert.equal(u.searchParams.get('curr'), 'VND');
  assert.equal(u.searchParams.get('hl'), 'zh-TW');
});

test('Skyscanner link uses YYMMDD and business cabin, localized host', () => {
  const u = skyscannerUrl(q);
  assert.match(u, /skyscanner\.com\.tw\/transport\/flights\/tpe\/cdg\/261110\/261124\//);
  assert.match(u, /cabinclass=business/);
  assert.match(skyscannerUrl({ ...q, lang: 'ko' }), /skyscanner\.co\.kr/);
});

test('KAYAK link', () => {
  assert.equal(kayakUrl(q), 'https://www.kayak.com/flights/TPE-CDG/2026-11-10/2026-11-24/business?sort=price_a');
  assert.equal(searchLinks(q).length, 3);
});
