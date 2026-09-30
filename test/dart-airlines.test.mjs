import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, renderPrograms, OUT, OUT_PROGRAMS, AIRPORTS_SRC, AIRPORTS_OUT } from '../scripts/gen-dart-airlines.mjs';

test('Flutter airline table is in sync with web/core/airlines.js', () => {
  assert.equal(readFileSync(OUT, 'utf8'), render(), 'run: node scripts/gen-dart-airlines.mjs');
});

test('Flutter loyalty-program table is in sync with web/core/programs.js', () => {
  assert.equal(readFileSync(OUT_PROGRAMS, 'utf8'), renderPrograms(), 'run: node scripts/gen-dart-airlines.mjs');
});

test('Flutter airport-country asset is a byte-identical copy of config/airport-countries.json', () => {
  assert.ok(readFileSync(AIRPORTS_SRC).equals(readFileSync(AIRPORTS_OUT)), 'run: node scripts/gen-dart-airlines.mjs');
});
