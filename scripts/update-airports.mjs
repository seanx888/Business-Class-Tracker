#!/usr/bin/env node
// Regenerates config/airport-countries.json (IATA → ISO country) from OurAirports (public domain).
// The scanner uses it so the China/HK/Macau filter can verify ANY airport, not just the built-in list.
// Usage: node scripts/update-airports.mjs [path-to-local-airports.csv]

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './lib/csv.mjs';

const SRC = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const OUT = fileURLToPath(new URL('../config/airport-countries.json', import.meta.url));

const TYPE_RANK = { large_airport: 0, medium_airport: 1, small_airport: 2, seaplane_base: 3, heliport: 4, closed: 5 };

async function main() {
  const local = process.argv[2];
  const text = local ? await readFile(local, 'utf8') : await (await fetch(SRC)).text();
  const rows = parseCsv(text);
  const head = rows.shift();
  const col = (name) => head.indexOf(name);
  const iI = col('iata_code'), cI = col('iso_country'), tI = col('type'), sI = col('scheduled_service');
  if ([iI, cI, tI].some((i) => i < 0)) throw new Error('Unexpected OurAirports CSV header');

  const best = new Map();
  for (const r of rows) {
    const iata = (r[iI] || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iata)) continue;
    const rank = (TYPE_RANK[r[tI]] ?? 6) - (r[sI] === 'yes' ? 10 : 0);
    const prev = best.get(iata);
    if (!prev || rank < prev.rank) best.set(iata, { country: r[cI], rank });
  }
  const out = {};
  for (const k of [...best.keys()].sort()) out[k] = best.get(k).country;
  await writeFile(OUT, JSON.stringify(out) + '\n');
  const blocked = Object.values(out).filter((c) => ['CN', 'HK', 'MO'].includes(c)).length;
  console.log(`Wrote ${Object.keys(out).length} airports (${blocked} in CN/HK/MO) → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
