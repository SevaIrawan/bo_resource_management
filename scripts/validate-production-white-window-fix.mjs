/**
 * Cegah regresi kotak Chrome putih (Puppeteer WA) saat Sync / Run Scraper.
 * Jalankan: node scripts/validate-production-white-window-fix.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const waTs = fs.readFileSync(
  path.join(root, 'electron/main/platformLogin/whatsapp.ts'),
  'utf8',
);
const chromeTs = fs.readFileSync(
  path.join(root, 'electron/main/platformLogin/waPuppeteerChrome.ts'),
  'utf8',
);
const validateTs = fs.readFileSync(
  path.join(root, 'electron/main/scraper/validateSession.ts'),
  'utf8',
);

const checks = [
  {
    name: 'waClientPuppeteerOptions terpusat',
    ok: chromeTs.includes('export function waClientPuppeteerOptions'),
  },
  {
    name: 'Chrome headless=new + off-screen Windows',
    ok:
      chromeTs.includes("'--headless=new'") &&
      chromeTs.includes("'--window-position=-24000,-24000'"),
  },
  {
    name: 'whatsapp.ts pakai waClientPuppeteerOptions',
    ok: waTs.includes('waClientPuppeteerOptions()'),
  },
  {
    name: 'destroy WA tutup pupBrowser sebelum client.destroy',
    ok:
      waTs.includes('closeWhatsAppPuppeteer') &&
      waTs.includes('pupBrowser') &&
      waTs.includes('browser.close'),
  },
  {
    name: 'Probe strict gagal → forceRelease (hindari double Chrome)',
    ok:
      validateTs.includes('forceReleaseWhatsAppForLogin') &&
      validateTs.includes('strict && !result.valid'),
  },
  {
    name: 'Phone login tanpa showNotification (hindari window OS)',
    ok: waTs.includes('showNotification: false'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log(`\n${checks.length} checks passed.`);
