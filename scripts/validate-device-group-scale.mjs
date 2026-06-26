/**
 * Skala hingga 6000 grup (store cap): idle watchdog, abort on stale, 4 akun paralel.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const scaleElectron = read('electron/main/scraper/deviceGroupScale.ts');
const scalePolicy = read('src/config/syncScraperPolicy.ts');
const loginFlow = read('src/services/loginFlowService.ts');
const syncFlow = read('src/services/syncFlowService.ts');
const waCount = read('electron/main/scraper/countWhatsApp.ts');
const waScrape = read('electron/main/scraper/whatsappScrape.ts');
const tgPy = read('python-sidecar/telegram_scraper.py');
const tgScrape = read('electron/main/scraper/telegramScrape.ts');
const watchdog = read('electron/main/scraper/scrapeWatchdog.ts');
const scrapeProgress = read('electron/main/scraper/scrapeProgress.ts');

const executeSyncCheckBody = syncFlow.slice(
  syncFlow.indexOf('export async function executeSyncCheck'),
  syncFlow.indexOf('export async function recordSyncCheckActivity'),
);

const checks = [
  {
    name: 'Store cap 6000 grup (electron)',
    ok:
      scaleElectron.includes('WA_STORE_GROUP_LIST_CAP = 6000') &&
      scaleElectron.includes('DEVICE_GROUP_TARGET_MAX = WA_STORE_GROUP_LIST_CAP'),
  },
  {
    name: 'Store cap 6000 grup (policy + telegram sidecar)',
    ok:
      scalePolicy.includes('deviceGroupTargetMax: 6000') &&
      tgPy.includes('DEVICE_GROUP_TARGET_MAX = 6000'),
  },
  {
    name: 'Tidak ada wall-clock scrape tetap (3600s / SCRAPE_MAX_MS)',
    ok:
      !scaleElectron.includes('const SCRAPE_MAX_MS') &&
      !scaleElectron.includes('3_600_000') &&
      !waScrape.includes('withScrapeTimeout'),
  },
  {
    name: 'Idle watchdog saja + abort on stale',
    ok:
      watchdog.includes('no progress for') &&
      !watchdog.includes('maxTimer') &&
      !watchdog.includes('setScrapeWatchdogBudget') &&
      waScrape.includes("onStale: (sid) => abortActiveScrape(sid, 'whatsapp')"),
  },
  {
    name: 'Progress touch watchdog (UI + per grup)',
    ok:
      scrapeProgress.includes('touchScrapeWatchdog(payload.sessionId)') &&
      waScrape.includes('touchScrapeWatchdog(input.sessionId)'),
  },
  {
    name: 'Watchdog WA dimulai setelah client terbuka (bukan sebelum pool)',
    ok:
      waScrape.includes('withWhatsAppClient') &&
      /withWhatsAppClient[\s\S]{0,200}withScrapeWatchdog/.test(waScrape),
  },
  {
    name: 'Dua fase WA: metadata paralel + invite serial',
    ok:
      waScrape.includes('runPooled') &&
      waScrape.includes('waInviteExportDelayMs') &&
      !/runPooled[\s\S]{0,400}fetchWhatsAppGroupInviteLink/.test(waScrape),
  },
  {
    name: 'Estimasi plan dari count device (log only)',
    ok:
      scaleElectron.includes('scrapeTotalPlanMs') &&
      scaleElectron.includes('scrapeInvitePhaseBudgetMs') &&
      waScrape.includes('scrapeTotalPlanMs(total, adminRows.length)'),
  },
  {
    name: 'TG idle watchdog + cancel sidecar on stale',
    ok:
      tgScrape.includes('withScrapeWatchdog') &&
      tgScrape.includes('cancelTelegramScrape(sid)') &&
      !tgScrape.includes('AbortSignal.timeout(scrapeGroupsTimeoutMs'),
  },
  {
    name: 'TG scrape progress poll',
    ok:
      tgScrape.includes('/telegram/scrape/progress/') &&
      tgPy.includes('get_scrape_progress'),
  },
  {
    name: 'Manual sync valid: probe session saja (tanpa device count)',
    ok:
      !executeSyncCheckBody.includes('detectGroupsAndBuildSyncPayload') &&
      !executeSyncCheckBody.includes('syncDetectTimeoutMs'),
  },
  {
    name: 'Post-login detect timeout tetap (bukan skala grup)',
    ok:
      scalePolicy.includes('postLoginDetect') &&
      loginFlow.includes('postLoginDetectTimeoutMs'),
  },
  {
    name: 'WA quick count + runPooled full admin',
    ok: waCount.includes('runPooled') && waCount.includes('countWhatsAppGroupsQuick'),
  },
  {
    name: 'WA scrape metadata concurrency capped',
    ok:
      scaleElectron.includes('WA_SCRAPE_METADATA_CONCURRENCY') &&
      waScrape.includes('WA_SCRAPE_METADATA_CONCURRENCY'),
  },
  {
    name: 'WA puppeteer protocolTimeout configured',
    ok: read('electron/main/platformLogin/waPuppeteerChrome.ts').includes('protocolTimeout'),
  },
  {
    name: 'Post-login pakai quickDeviceCount (bukan manual sync valid)',
    ok: /quickDeviceCount:\s*true/.test(loginFlow),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nDevice group scale (idle watchdog) checks passed.');
