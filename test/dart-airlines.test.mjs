import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, renderPrograms, OUT, OUT_PROGRAMS, ASSET_COPIES } from '../scripts/gen-dart-airlines.mjs';

test('Flutter airline table is in sync with web/core/airlines.js', () => {
  assert.equal(readFileSync(OUT, 'utf8'), render(), 'run: node scripts/gen-dart-airlines.mjs');
});

test('Flutter loyalty-program table is in sync with web/core/programs.js', () => {
  assert.equal(readFileSync(OUT_PROGRAMS, 'utf8'), renderPrograms(), 'run: node scripts/gen-dart-airlines.mjs');
});

test('Flutter airport assets (countries, coordinates) are byte-identical copies of config/', () => {
  for (const [src, out] of ASSET_COPIES) {
    assert.ok(readFileSync(src).equals(readFileSync(out)), `${out} is stale — run: node scripts/gen-dart-airlines.mjs`);
  }
});

test('airport coordinates are sane: every entry is [lat, lon, city] within range; key airports resolve', () => {
  const geo = JSON.parse(readFileSync(new URL('../config/airport-geo.json', import.meta.url), 'utf8'));
  for (const [iata, [lat, lon, city]] of Object.entries(geo)) {
    assert.match(iata, /^[A-Z]{3}$/);
    assert.ok(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180, iata);
    assert.equal(typeof city, 'string');
  }
  for (const k of ['TPE', 'NRT', 'ICN', 'LAX', 'CDG', 'BKK', 'SIN']) assert.ok(geo[k], k);
  assert.ok(Object.keys(geo).length > 5000);
});
