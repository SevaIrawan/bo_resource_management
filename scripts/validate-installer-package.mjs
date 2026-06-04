/**
 * Pastikan artefak wajib installer ada sebelum build (Chrome, sidecar, env template, extraResources).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CHROME_BINARY,
  findChromeBinaryUnder,
  sidecarBinaryName,
  sidecarResourcePath,
} from './lib/cross-platform-artifacts.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const pkg = JSON.parse(read('package.json'));
const build = pkg.build ?? {};
const extra = build.extraResources ?? [];
const files = build.files ?? [];
const asarUnpack = build.asarUnpack ?? [];
const sidecarName = sidecarBinaryName();
const sidecarPath = sidecarResourcePath(root);

function platformExtraResources(platformKey) {
  return [...extra, ...(build[platformKey]?.extraResources ?? [])];
}

const checks = [
  {
    name: `Chrome terbundel (resources/puppeteer-cache) — ${CHROME_BINARY}`,
    ok: Boolean(findChromeBinaryUnder(path.join(root, 'resources', 'puppeteer-cache', 'chrome'))),
  },
  {
    name: `Sidecar Telegram (${sidecarName})`,
    ok: fs.existsSync(sidecarPath),
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
    name: `extraResources Win: sidecar ${sidecarBinaryName('win32')}`,
    ok: platformExtraResources('win').some((e) =>
      String(e.to).includes(`sidecar/${sidecarBinaryName('win32')}`),
    ),
  },
  {
    name: `extraResources Mac/Linux: sidecar ${sidecarBinaryName('darwin')}`,
    ok: platformExtraResources('mac').some((e) =>
      String(e.to).includes(`sidecar/${sidecarBinaryName('darwin')}`),
    ),
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
