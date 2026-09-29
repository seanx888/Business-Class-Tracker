import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, OUT } from '../scripts/gen-dart-airlines.mjs';

test('Flutter airline table is in sync with web/core/airlines.js', () => {
  assert.equal(readFileSync(OUT, 'utf8'), render(), 'run: node scripts/gen-dart-airlines.mjs');
});
