import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

globalThis.document = { documentElement: {} };
const { STRINGS } = await import('../web/i18n.js');
const LANGS = Object.keys(STRINGS);

const root = new URL('../web/', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (['api', 'data', 'icons'].includes(name)) continue;
      walk(p);
    } else if (name.endsWith('.js') && !['i18n.js', 'i18n-more.js', 'icons.js', 'sw.js'].includes(name)) files.push(p);
  }
})(root);

// t('key') · t("key") · t(`key`) — literal keys; t(`prefix_${x}`) · t('prefix_' + x) — dynamic: the prefix must exist.
const LITERAL = /\bt\(\s*(['"`])([A-Za-z0-9_.:-]+)\1\s*[,)]/g;
const DYNAMIC_TPL = /\bt\(\s*`([A-Za-z0-9_.:-]+)\$\{/g;
const DYNAMIC_CAT = /\bt\(\s*(['"])([A-Za-z0-9_.:-]+)\1\s*\+/g;

function usage() {
  const literal = new Map();
  const prefixes = new Map();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const rel = path.relative(root, f);
    for (const m of src.matchAll(LITERAL)) literal.set(m[2], rel);
    for (const m of src.matchAll(DYNAMIC_TPL)) prefixes.set(m[1], rel);
    for (const m of src.matchAll(DYNAMIC_CAT)) prefixes.set(m[2], rel);
  }
  return { literal, prefixes };
}

test('every language has the same keys', () => {
  const base = new Set(Object.keys(STRINGS['zh-TW']));
  for (const lang of LANGS) {
    const keys = new Set(Object.keys(STRINGS[lang]));
    const missing = [...base].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !base.has(k));
    assert.deepEqual(missing, [], `${lang} lacks ${missing.slice(0, 12).join(', ')}`);
    assert.deepEqual(extra, [], `${lang} has keys zh-TW lacks: ${extra.slice(0, 12).join(', ')}`);
  }
});

test('every string the screens ask for exists in every language', () => {
  const { literal, prefixes } = usage();
  assert.ok(literal.size > 150, `only ${literal.size} keys found — is the scan broken?`);
  const missing = [];
  for (const [key, file] of literal) for (const lang of LANGS) if (STRINGS[lang][key] === undefined) missing.push(`${lang}:${key} (${file})`);
  assert.deepEqual(missing, [], `missing strings:\n  ${missing.slice(0, 40).join('\n  ')}`);
  const noPrefix = [];
  for (const [prefix, file] of prefixes) for (const lang of LANGS) if (!Object.keys(STRINGS[lang]).some((k) => k.startsWith(prefix))) noPrefix.push(`${lang}:${prefix}* (${file})`);
  assert.deepEqual(noPrefix, [], `no keys with prefix:\n  ${noPrefix.join('\n  ')}`);
});

test('placeholders match between languages', () => {
  const ph = (s) => (typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',') : '');
  const bad = [];
  for (const [key, zh] of Object.entries(STRINGS['zh-TW'])) {
    if (typeof zh !== 'string') continue;
    for (const lang of LANGS) if (ph(STRINGS[lang][key]) !== ph(zh)) bad.push(`${lang}:${key} {${ph(STRINGS[lang][key])}} vs zh-TW {${ph(zh)}}`);
  }
  assert.deepEqual(bad, []);
});
