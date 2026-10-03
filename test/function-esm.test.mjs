// Vercel loads web/api/*.mjs with module-type detection off: a web/core/*.js file is an ES module only if a package.json with
// "type": "module" sits above it. Without web/package.json the live-search function died with "does not provide an export named …".
// This test starts the functions the way Vercel does, from a copy of web/ that has no other package.json above it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const web = new URL('../web/', import.meta.url).pathname;

function copyWeb({ withPackageJson }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vercel-esm-'));
  mkdirSync(path.join(dir, 'web', 'data'), { recursive: true });
  for (const sub of ['api', 'core']) cpSync(path.join(web, sub), path.join(dir, 'web', sub), { recursive: true });
  cpSync(path.join(web, 'data', 'airport-countries.json'), path.join(dir, 'web', 'data', 'airport-countries.json'));
  if (withPackageJson) cpSync(path.join(web, 'package.json'), path.join(dir, 'web', 'package.json'));
  return dir;
}

function load(dir, file) {
  const code = `const m = await import(${JSON.stringify(path.join(dir, 'web', 'api', file))}); console.log(typeof m.default?.fetch ?? typeof m.default);`;
  return spawnSync(process.execPath, ['--experimental-default-type=commonjs', '--input-type=module', '-e', code], { encoding: 'utf8', timeout: 30000 });
}

test('web/package.json exists and declares ES modules', () => {
  assert.ok(existsSync(path.join(web, 'package.json')));
  assert.equal(JSON.parse(readFileSync(path.join(web, 'package.json'), 'utf8')).type, 'module');
});

test('every Vercel function starts when .js files are not auto-detected as ES modules', (t) => {
  const bad = copyWeb({ withPackageJson: false });
  const control = load(bad, 'search.mjs');
  rmSync(bad, { recursive: true, force: true });
  if (control.status === 0) return t.skip('this Node still detects ES modules with the flag, so the failure cannot be reproduced here');
  assert.match(control.stderr, /CommonJS module|does not provide an export/, 'without web/package.json the function cannot load web/core');

  const good = copyWeb({ withPackageJson: true });
  try {
    for (const file of ['search.mjs', 'trackers.mjs', 'auth.mjs']) {
      const r = load(good, file);
      assert.equal(r.status, 0, `${file}: ${r.stderr.split('\n').find((l) => /Error/.test(l)) || r.stderr.slice(0, 200)}`);
      assert.match(r.stdout, /function/, file);
    }
  } finally {
    rmSync(good, { recursive: true, force: true });
  }
});
