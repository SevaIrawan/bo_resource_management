/**
 * Skala hingga ~3000 grup: timeout, quick count, scrape paralel.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const scaleElectron = read('electron/main/scraper/deviceGroupScale.ts');
const scalePolicy = read('src/config/syncScraperPolicy.ts');
const scaleRenderer = read('src/lib/deviceGroupScale.ts');
const loginFlow = read('src/services/loginFlowService.ts');
const syncFlow = read('src/services/syncFlowService.ts');
const waCount = read('electron/main/scraper/countWhatsApp.ts');
const waScrape = read('electron/main/scraper/whatsappScrape.ts');
const tgPy = read('python-sidecar/telegram_scraper.py');

const tgScrape = read('electron/main/scraper/telegramScrape.ts');

const checks = [
  {
    name: 'Target 3000 grup (electron)',
    ok: scaleElectron.includes('DEVICE_GROUP_TARGET_MAX = 3000'),
  },
  {
    name: 'Target 3000 grup (telegram sidecar)',
    ok:
      tgPy.includes('DEVICE_GROUP_TARGET_MAX = 3000') &&
      tgPy.includes('len(targets) < DEVICE_GROUP_TARGET_MAX'),
  },
  {
    name: 'WA scrape timeout',
    ok: waScrape.includes('withScrapeTimeout') && waScrape.includes('scrapeGroupsTimeoutMs'),
  },
  {
    name: 'TG scrape progress poll',
    ok:
      tgScrape.includes('/telegram/scrape/progress/') &&
      tgPy.includes('get_scrape_progress'),
  },
  {
    name: 'Timeout sync/login scale (renderer)',
    ok:
      scalePolicy.includes('deviceGroupTargetMax: 3000') &&
      scaleRenderer.includes('postLoginSyncTimeoutMs') &&
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
      /quickDeviceCount:\s*true/.test(loginFlow) &&
      (syncFlow.match(/quickDeviceCount:\s*true/g) ?? []).length >= 1,
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nDevice group scale (3000) checks passed.');
