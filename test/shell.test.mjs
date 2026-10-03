import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const web = new URL('../web/', import.meta.url).pathname;
const sw = readFileSync(path.join(web, 'sw.js'), 'utf8');
const shell = [...sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];')).matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== './');

// Every module the app imports (statically) must be in the offline shell, or the installed app breaks without a network.
function imports(file, seen = new Set()) {
  const full = path.join(web, file);
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = readFileSync(full, 'utf8');
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+'(\.[^']+)'/g)) {
    const next = path.normalize(path.join(path.dirname(file), m[1]));
    if (next.endsWith('.js')) imports(next, seen);
  }
  return seen;
}

test('every file in the offline shell exists', () => {
  for (const f of shell) assert.ok(existsSync(path.join(web, f)), f);
});

test('every module reachable from app.js is cached for offline use', () => {
  const needed = [...imports('app.js')];
  const missing = needed.filter((f) => !shell.includes(f));
  assert.deepEqual(missing, [], `add to SHELL in sw.js: ${missing.join(', ')}`);
});

test('index.html loads app.js and every stylesheet it names is in the shell', () => {
  const html = readFileSync(path.join(web, 'index.html'), 'utf8');
  assert.match(html, /<script type="module" src="app\.js">/);
  assert.ok(shell.includes('styles.css'));
});
