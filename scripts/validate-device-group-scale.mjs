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
const loginHook = read('src/hooks/useAccountSyncFlow.ts');
const syncFlow = read('src/services/syncFlowService.ts');
const gateSrc = read('src/lib/deviceSessionGate.ts');
const waLogin = read('electron/main/platformLogin/whatsapp.ts');
const validateSession = read('electron/main/scraper/validateSession.ts');
const waScrape = read('electron/main/scraper/whatsappScrape.ts');
const tgPy = read('python-sidecar/telegram_scraper.py');
const tgScrape = read('electron/main/scraper/telegramScrape.ts');
const watchdog = read('electron/main/scraper/scrapeWatchdog.ts');
const scrapeProgress = read('electron/main/scraper/scrapeProgress.ts');
const scraperIdx = read('electron/main/scraper/index.ts');

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
      scaleElectron.includes('formatScrapeEtaLabel') &&
      (waScrape.includes('scrapeTotalPlanMs(total, adminRows.length)') ||
        waScrape.includes('scrapeTotalPlanMs(total, adminNeedInvite.length)')),
  },
  {
    name: 'TG progress poll hanya emit jika fingerprint berubah',
    ok: tgScrape.includes('lastFingerprint') && tgScrape.includes('json.seq'),
  },
  {
    name: 'WA inbox stable: count 0 bukan sukses (anti SCRAPER_NO_GROUPS palsu)',
    ok:
      read('electron/main/scraper/whatsappGroupDiscovery.ts').includes(
        'count >= minGroups && count === lastCount',
      ) &&
      read('electron/main/scraper/whatsappGroupDiscovery.ts').includes('minGroups') &&
      read('electron/main/scraper/whatsappGroupDiscovery.ts').includes('@g.us') &&
      read('electron/main/scraper/whatsappGroupDiscovery.ts').includes('peakCount') &&
      scaleElectron.includes('waInboxStableRounds') &&
      waScrape.includes('waInboxStableRounds') &&
      waScrape.includes('syncedCount') &&
      !read('electron/main/scraper/whatsappScrapeQuality.ts').includes('tidak mengembalikan') &&
      read('electron/main/scraper/whatsappScrapeQuality.ts').includes("throw new Error('SCRAPER_NO_GROUPS')"),
  },
  {
    name: 'WA auto = manual scrape body (shared opts + inbox scale 5k)',
    ok:
      waScrape.includes('waScrapeSharedClientOpts') &&
      waScrape.includes('scaleEstimate') &&
      waScrape.includes('runWhatsAppScrapeAutoLane') &&
      /runWhatsAppScrapeAutoLane[\s\S]*?waScrapeSharedClientOpts/.test(waScrape) &&
      /runWhatsAppScrape\([\s\S]*?waScrapeSharedClientOpts/.test(waScrape),
  },
  {
    name: 'WA scrape checkpoint resume + incomplete store fails clearly',
    ok:
      waScrape.includes('loadScrapeCheckpoint') &&
      waScrape.includes('clearScrapeCheckpoint') &&
      waScrape.includes('SCRAPER_INCOMPLETE'),
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
    name: 'TG scrape async job + result poll (bukan POST panjang)',
    ok:
      tgScrape.includes('/telegram/scrape/result/') &&
      tgScrape.includes("'started'") &&
      !tgScrape.includes("withNetworkRetry('Telegram scrape'") &&
      tgPy.includes('start_telegram_scrape_job') &&
      read('python-sidecar/main.py').includes('/telegram/scrape/result/') &&
      read('electron/main/platformLogin/telegramSidecar.ts').includes('SIDECAR_VERSION = 4'),
  },
  {
    name: 'TG finishing: reconnect sebelum export + soft-fail setelah write DB',
    ok:
      read('python-sidecar/telegram_login.py').includes('_ensure_client_connected') &&
      read('python-sidecar/telegram_login.py').includes('_force_reconnect') &&
      read('python-sidecar/telegram_login.py').includes('serialize session TIDAK bergantung get_me') &&
      read('python-sidecar/telegram_scraper.py').includes('payload["sessionString"]') &&
      read('src/lib/runAccountScraper.ts').includes('session export warning') &&
      read('src/lib/runAccountScraper.ts').includes('fromScrape') &&
      tgScrape.includes('sessionString: fromResult'),
  },
  {
    name: 'TG scrape start/idle grace long (bukan putus 20s)',
    ok:
      tgScrape.includes('TG_SCRAPE_START_TIMEOUT_MS') &&
      tgScrape.includes('idleMisses >= 240'),
  },
  {
    name: 'WA protocolTimeout + inboxStable scale idle (akun besar)',
    ok:
      read('electron/main/platformLogin/waPuppeteerChrome.ts').includes('1_200_000') &&
      waScrape.includes('scrapeIdleTimeoutMs(scaleEstimate)') &&
      waScrape.includes('scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX)'),
  },
  {
    name: 'Idle watchdog scale 5k (scrapeIdleTimeoutMs) + policy mirror',
    ok:
      scaleElectron.includes('scrapeIdleTimeoutMs') &&
      scaleElectron.includes('2_700_000') &&
      scalePolicy.includes('scrapeIdleTimeoutMs') &&
      waScrape.includes('scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX)') &&
      tgScrape.includes('scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX)'),
  },
  {
    name: 'WA checkpoint tiap N grup (metadata + invite) + resume',
    ok:
      scaleElectron.includes('WA_SCRAPE_CHECKPOINT_EVERY') &&
      waScrape.includes('WA_SCRAPE_CHECKPOINT_EVERY') &&
      waScrape.includes('loadScrapeCheckpoint') &&
      waScrape.includes('RESUMED_CHECKPOINT'),
  },
  {
    name: 'TG partial checkpoint + no sidecar kill mid-scrape',
    ok:
      tgPy.includes('PARTIAL_CHECKPOINT') &&
      tgPy.includes('PARTIAL_AFTER_ERROR') &&
      tgPy.includes('count_active_telegram_scrapes') &&
      read('python-sidecar/main.py').includes('activeScrapes') &&
      read('electron/main/platformLogin/telegramSidecar.ts').includes('activeScrapes') &&
      read('electron/main/platformLogin/telegramSidecar.ts').includes('skip restart'),
  },
  {
    name: 'TG truncate >6000: hint TRUNCATED (bukan sukses diam)',
    ok:
      tgPy.includes('TRUNCATED_') &&
      tgPy.includes('truncated') &&
      tgPy.includes('ScrapeCancelled') &&
      read('src/services/scrapeFlowService.ts').includes('SCRAPER_TRUNCATED_CAP') &&
      read('src/lib/scrapeErrorUi.ts').includes('SCRAPER_TRUNCATED_CAP'),
  },
  {
    name: 'Manual sync valid: probe device tanpa count daftar grup',
    ok:
      !executeSyncCheckBody.includes('detectGroupsAndBuildSyncPayload') &&
      !executeSyncCheckBody.includes('syncDetectTimeoutMs') &&
      !executeSyncCheckBody.includes('backfillPlatformSessionIfNeeded'),
  },
  {
    name: 'Sync/Scrape gate probe device (strict:true) — bukan disk-only Valid',
    ok:
      gateSrc.includes('strict: true') &&
      !gateSrc.includes('WA_DISK_AUTH') &&
      waLogin.includes('probeWhatsAppSessionLinked') &&
      validateSession.includes('probeWhatsAppSessionLinked') &&
      !validateSession.includes('WA_DISK_AUTH_SYNC_LIGHT') &&
      !validateSession.includes('TG_STORED_SESSION_SYNC_LIGHT'),
  },
  {
    name: 'Post-login Sync: tanpa detect/count device (hindari skala grup)',
    ok: (() => {
      const start = loginFlow.indexOf('export async function applyDailyMetricsAfterLogin');
      const next = loginFlow.indexOf('\nexport async function', start + 1);
      const body = start >= 0 ? loginFlow.slice(start, next > start ? next : undefined) : '';
      return (
        body.length > 0 &&
        !body.includes('quickDeviceCount') &&
        !body.includes('detectGroupsAndBuildSyncPayload')
      );
    })(),
  },
  {
    name: 'Device count IPC/stack dihapus (estimasi inbox hanya di scrape via countWhatsAppGroupsOnDevice)',
    ok:
      !fs.existsSync(path.join(root, 'electron/main/scraper/countWhatsApp.ts')) &&
      !scraperIdx.includes('scraper:count-groups') &&
      waScrape.includes('countWhatsAppGroupsOnDevice') &&
      waScrape.includes('runPooled'),
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
    name: 'Later finalisasi sessionOnly + markPlatformSessionSynced',
    ok:
      loginHook.includes('dismissScrapePrompt') &&
      /sessionOnly:\s*true/.test(loginHook) &&
      loginHook.includes('markPlatformSessionSynced'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nDevice group scale (idle watchdog) checks passed.');
