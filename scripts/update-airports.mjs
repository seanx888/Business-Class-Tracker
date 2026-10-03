#!/usr/bin/env node
// Regenerates config/airport-countries.json (IATA → ISO country) and config/airport-geo.json (IATA → [lat, lon, city])
// from OurAirports (public domain).
// The scanner uses the country table so the China/HK/Macau filter can verify ANY airport, not just the built-in list;
// the mobile app bundles both (Passport stats, distance of hand-entered flights, route map).
// Usage: node scripts/update-airports.mjs [path-to-local-airports.csv]

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './lib/csv.mjs';

const SRC = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const OUT = fileURLToPath(new URL('../config/airport-countries.json', import.meta.url));
// The live-search API (web/api/search.mjs) is deployed from web/ only, so it reads its own copy of the country table.
export const WEB_OUT = fileURLToPath(new URL('../web/data/airport-countries.json', import.meta.url));
export const GEO_OUT = fileURLToPath(new URL('../config/airport-geo.json', import.meta.url));

const TYPE_RANK = { large_airport: 0, medium_airport: 1, small_airport: 2, seaplane_base: 3, heliport: 4, closed: 5 };

async function main() {
  const local = process.argv[2];
  const text = local ? await readFile(local, 'utf8') : await (await fetch(SRC)).text();
  const rows = parseCsv(text);
  const head = rows.shift();
  const col = (name) => head.indexOf(name);
  const iI = col('iata_code'), cI = col('iso_country'), tI = col('type'), sI = col('scheduled_service');
  const latI = col('latitude_deg'), lonI = col('longitude_deg'), mI = col('municipality');
  if ([iI, cI, tI, latI, lonI].some((i) => i < 0)) throw new Error('Unexpected OurAirports CSV header');

  const best = new Map();
  for (const r of rows) {
    const iata = (r[iI] || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iata)) continue;
    const rank = (TYPE_RANK[r[tI]] ?? 6) - (r[sI] === 'yes' ? 10 : 0);
    const prev = best.get(iata);
    if (!prev || rank < prev.rank) best.set(iata, { country: r[cI], rank, lat: Number(r[latI]), lon: Number(r[lonI]), city: (r[mI] || '').trim() });
  }
  const out = {};
  for (const k of [...best.keys()].sort()) out[k] = best.get(k).country;
  await writeFile(OUT, JSON.stringify(out) + '\n');
  await writeFile(WEB_OUT, JSON.stringify(out) + '\n');
  // Two decimals ≈ 1 km — plenty for great-circle distances and a route map.
  const geo = {};
  for (const k of [...best.keys()].sort()) {
    const b = best.get(k);
    if (Number.isFinite(b.lat) && Number.isFinite(b.lon)) geo[k] = [Math.round(b.lat * 100) / 100, Math.round(b.lon * 100) / 100, b.city];
  }
  await writeFile(GEO_OUT, JSON.stringify(geo) + '\n');
  const blocked = Object.values(out).filter((c) => ['CN', 'HK', 'MO'].includes(c)).length;
  console.log(`Wrote ${Object.keys(out).length} airports (${blocked} in CN/HK/MO) → ${OUT}`);
  console.log(`Wrote ${Object.keys(geo).length} airport coordinates → ${GEO_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
