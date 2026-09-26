#!/usr/bin/env node
// Renders web/icons/*.svg to the PNG sizes PWAs / iOS need, using Playwright's Chromium.
// Usage: node scripts/make-icons.mjs   (needs `playwright` installed locally or globally)
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(`${root}/`)('playwright');
  }
}

const dir = fileURLToPath(new URL('../web/icons/', import.meta.url));
const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon.svg', 'apple-touch-icon.png', 180],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
];

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  let svg = await readFile(dir + src, 'utf8');
  // iOS rounds corners itself — give the apple icon a full-bleed background.
  if (out.startsWith('apple')) svg = svg.replace('rx="112"', 'rx="0"');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: dir + out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', out);
}
await browser.close();
