/**
 * Skala ~2000 grup: timeout, quick count, scrape paralel.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const scaleElectron = read('electron/main/scraper/deviceGroupScale.ts');
const scaleRenderer = read('src/lib/deviceGroupScale.ts');
const waCount = read('electron/main/scraper/countWhatsApp.ts');
const waScrape = read('electron/main/scraper/whatsappScrape.ts');
const tgPy = read('python-sidecar/telegram_scraper.py');
const syncFlow = read('src/hooks/useAccountSyncFlow.ts');

const checks = [
  {
    name: 'Target 2000 grup (electron)',
    ok: scaleElectron.includes('DEVICE_GROUP_TARGET_MAX = 2000'),
  },
  {
    name: 'Timeout sync/login scale (renderer)',
    ok:
      scaleRenderer.includes('DEVICE_GROUP_TARGET_MAX = 2000') &&
      syncFlow.includes('loginSyncAfterTimeoutMs') &&
      syncFlow.includes('manualSyncTimeoutMs'),
  },
  {
    name: 'WA quick count + runPooled full admin',
    ok: waCount.includes('runPooled') && waCount.includes('countWhatsAppGroupsQuick'),
  },
  {
    name: 'WA scrape paralel (bukan sequential 2000x)',
    ok: waScrape.includes('runPooled') && waScrape.includes('DEVICE_GROUP_TARGET_MAX'),
  },
  {
    name: 'Telegram count quick (iter_dialogs tanpa full scrape)',
    ok: tgPy.includes('_count_groups_quick') && tgPy.includes('quick: bool'),
  },
  {
    name: 'Post-login & manual sync pakai quickDeviceCount',
    ok:
      /quickDeviceCount:\s*true/.test(syncFlow) &&
      (syncFlow.match(/quickDeviceCount:\s*true/g) ?? []).length >= 2,
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nDevice group scale (2000) checks passed.');
