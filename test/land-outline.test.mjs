import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OUT, toRings } from '../scripts/build-land-outline.mjs';

const rings = JSON.parse(readFileSync(OUT, 'utf8'));

test('land outline asset: well-formed rings within lon/lat range, sensible size', () => {
  assert.ok(rings.length > 50 && rings.length < 400, `rings: ${rings.length}`);
  for (const r of rings) {
    assert.equal(r.length % 2, 0);
    assert.ok(r.length >= 8, 'a ring has at least 4 points');
    for (let i = 0; i < r.length; i += 2) {
      assert.ok(r[i] >= -180 && r[i] <= 180 && r[i + 1] >= -90 && r[i + 1] <= 90);
    }
  }
  assert.ok(readFileSync(OUT).length < 150_000, 'keep the asset small');
});

test('land outline covers the places the app draws: Taiwan and Japan are land', () => {
  const inRing = (lon, lat, r) => {
    let inside = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [r[i], r[i + 1], r[j], r[j + 1]];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const isLand = (lon, lat) => rings.some((r) => inRing(lon, lat, r));
  assert.ok(isLand(120.9, 23.7), 'Taiwan');
  assert.ok(isLand(138.5, 36.5), 'Honshu');
  assert.ok(isLand(-100, 40), 'North America');
  assert.ok(!isLand(-140, 30), 'mid-Pacific is not land');
});

test('toRings drops Antarctica and keeps exterior rings only', () => {
  const geo = {
    features: [
      { geometry: { type: 'Polygon', coordinates: [[[0, -70], [1, -70], [1, -75], [0, -75], [0, -70]]] } },
      { geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[2, 2], [3, 2], [3, 3], [2, 2]]] } },
    ],
  };
  const out = toRings(geo);
  assert.equal(out.length, 1);
  assert.equal(out[0].length, 10);
});
