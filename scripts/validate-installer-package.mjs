/**
 * Pastikan artefak wajib installer ada sebelum build (Chrome, sidecar, env template, extraResources).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const CHROME_BINARY = process.platform === 'win32' ? 'chrome.exe' : 'chrome';

function findChromeExeUnder(dir, depth = 0) {
  if (depth > 10 || !fs.existsSync(dir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === CHROME_BINARY) return full;
    if (entry.isDirectory()) {
      const nested = findChromeExeUnder(full, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

const pkg = JSON.parse(read('package.json'));
const extra = pkg.build?.extraResources ?? [];
const files = pkg.build?.files ?? [];
const asarUnpack = pkg.build?.asarUnpack ?? [];

const checks = [
  {
    name: 'Chrome terbundel (resources/puppeteer-cache)',
    ok: Boolean(findChromeExeUnder(path.join(root, 'resources', 'puppeteer-cache', 'chrome'))),
  },
  {
    name: 'Sidecar Telegram (.exe)',
    ok: fs.existsSync(path.join(root, 'resources', 'sidecar', 'rm-telegram-sidecar.exe')),
  },
  {
    name: 'Template env organisasi',
    ok: fs.existsSync(path.join(root, 'resources', 'org-default.env')),
  },
  {
    name: 'extraResources: puppeteer-chrome',
    ok: extra.some((e) => String(e.to).includes('puppeteer-chrome')),
  },
  {
    name: 'extraResources: sidecar exe',
    ok: extra.some((e) => String(e.to).includes('sidecar/rm-telegram-sidecar')),
  },
  {
    name: 'extraResources: org-default.env',
    ok: extra.some((e) => String(e.to).includes('org-default.env')),
  },
  {
    name: 'asarUnpack: whatsapp-web.js + puppeteer',
    ok:
      asarUnpack.some((p) => p.includes('whatsapp-web.js')) &&
      asarUnpack.some((p) => p.includes('puppeteer')),
  },
  {
    name: 'build files: dist + dist-electron',
    ok: files.some((f) => f.includes('dist-electron')),
  },
  {
    name: 'Dependencies runtime: whatsapp-web.js, puppeteer, supabase',
    ok:
      Boolean(pkg.dependencies?.['whatsapp-web.js']) &&
      Boolean(pkg.dependencies?.puppeteer) &&
      Boolean(pkg.dependencies?.['@supabase/supabase-js']),
  },
];

let failed = 0;
for (const c of checks) {
  const ok = c.ok;
  console.log(`${ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error('\nJalankan: npm run build:chrome && npm run build:sidecar');
  process.exit(1);
}
console.log('\nInstaller package checks passed.');
