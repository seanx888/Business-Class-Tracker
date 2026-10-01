#!/usr/bin/env node
// Builds apps/mobile/assets/world-land.json — a compact land outline for the flight route map — from Natural Earth
// 110m land polygons (public domain, https://www.naturalearthdata.com). Exterior rings only, Antarctica dropped,
// coordinates rounded to 0.1° (~11 km, plenty at map scale): [[lon, lat, lon, lat, …], …].
// Usage: node scripts/build-land-outline.mjs [path-to-ne_110m_land.geojson]
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';
export const OUT = fileURLToPath(new URL('../apps/mobile/assets/world-land.json', import.meta.url));

export function toRings(geojson) {
  const rings = [];
  for (const f of geojson.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      const outer = poly[0];
      if (!outer || Math.max(...outer.map((p) => p[1])) < -60) continue; // Antarctica
      const flat = [];
      for (const [lon, lat] of outer) flat.push(Math.round(lon * 10) / 10, Math.round(lat * 10) / 10);
      rings.push(flat);
    }
  }
  return rings;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const local = process.argv[2];
  const text = local ? await readFile(local, 'utf8') : await (await fetch(SRC)).text();
  const rings = toRings(JSON.parse(text));
  await writeFile(OUT, JSON.stringify(rings) + '\n');
  console.log(`Wrote ${rings.length} land rings (${rings.reduce((n, r) => n + r.length / 2, 0)} points) → ${OUT}`);
}
