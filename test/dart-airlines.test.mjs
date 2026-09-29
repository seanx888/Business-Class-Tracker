import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, renderPrograms, OUT, OUT_PROGRAMS } from '../scripts/gen-dart-airlines.mjs';

test('Flutter airline table is in sync with web/core/airlines.js', () => {
  assert.equal(readFileSync(OUT, 'utf8'), render(), 'run: node scripts/gen-dart-airlines.mjs');
});

test('Flutter loyalty-program table is in sync with web/core/programs.js', () => {
  assert.equal(readFileSync(OUT_PROGRAMS, 'utf8'), renderPrograms(), 'run: node scripts/gen-dart-airlines.mjs');
});
