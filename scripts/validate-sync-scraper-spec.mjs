/**
 * Selaraskan logic_sync_scraper.txt dengan implementasi (tanpa Electron).
 * Jalankan: node scripts/validate-sync-scraper-spec.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const spec = read('logic_sync_scraper.txt');
const syncFlow = read('src/hooks/useAccountSyncFlow.ts');
const uiFlow = read('src/lib/accountSyncUiFlow.ts');
const cells = read('src/components/group-monitoring/AccountMonitoringCells.tsx');
const loginHook = read('src/hooks/usePlatformLogin.ts');
const syncFlowService = read('src/services/syncFlowService.ts');

const specChecks = [
  ['group + admin disebut di spec', /group.*admin|admin.*group/i.test(spec)],
  ['resume-empty untuk 0 grup', /resume-empty|0 grup/i.test(spec)],
  ['Now/Later bila ada data scrape', /Now.*Later|Scraper Now/i.test(spec)],
  ['WA auto-regenerate QR', /WA.*auto|auto-regenerate|qrUpdated/i.test(spec)],
  ['TG error tanpa auto-loop', /TG.*error|Telegram.*error/i.test(spec) && /auto-loop|refresh manual/i.test(spec)],
  ['probe device meski grid valid', /meski.*valid|grid masih/i.test(spec)],
  ['sync pending tampil —', /pending.*—|sync_state/i.test(spec)],
  ['timestamp tanpa (Terbaru)', /timestamp|MATCH/i.test(spec) && !/\(Terbaru\)/.test(spec)],
  ['satu engine grid/modal group link', /accountMasterDailyCompare|fetchAccountGroupLinks/i.test(spec)],
];

const implChecks = [
  {
    name: 'handleLoginSuccess tutup login (setStep idle) sebelum Now/Later',
    ok:
      syncFlow.includes("setStep('idle')") &&
      syncFlow.includes('resolvePostLoginModalStep'),
  },
  {
    name: 'postSyncModalStep resume-empty vs scrape-prompt',
    ok:
      uiFlow.includes('shouldShowResumeOnlyEmpty') &&
      syncFlow.includes('resolvePostLoginModalStep'),
  },
  {
    name: 'resume-empty hanya jika daily hari ini + semua count 0',
    ok:
      uiFlow.includes('if (!input.hasDailyToday) return false') &&
      syncFlowService.includes('sync valid = probe session saja'),
  },
  {
    name: 'RUN intent scraper auto-scrape tanpa prompt',
    ok: syncFlow.includes("savedIntent === 'scraper'") && syncFlow.includes('runScrapeInBackground'),
  },
  {
    name: 'isRowMisaligned groups + admin',
    ok: uiFlow.includes('adminCurrent') && uiFlow.includes('groupsCurrent'),
  },
  {
    name: 'INVALID scraper: useSyncToLogin, tanpa RUN',
    ok: cells.includes('useSyncToLogin') && cells.includes('accountNeedsRelogin'),
  },
  {
    name: 'scrape selesai set lastSyncAt',
    ok: syncFlow.includes('lastSyncAt: outcome.scrapedAt'),
  },
  {
    name: 'VALID+RUN device probe gagal → login',
    ok: syncFlowService.includes('checkDeviceSessionForValidColumn') && syncFlow.includes('showLoginModal'),
  },
  {
    name: 'TG login error tanpa auto-loop (komentar produk)',
    ok: /tanpa auto-loop QR/i.test(loginHook),
  },
  {
    name: 'WA qrUpdated di i18n dipakai login',
    ok: loginHook.includes('setQrGeneration') && read('src/i18n/locales/en.ts').includes('qrUpdated'),
  },
  {
    name: 'Metrik bookmark: fetchAccountBookmarkMetrics + migrasi 029 raw group_id',
    ok:
      read('src/lib/accountSyncData.ts').includes('fetchAccountBookmarkMetrics') &&
      read('src/lib/accountMasterDailyCompare.ts').includes('computeAccountTicketBreakdown') &&
      fs.existsSync(path.join(root, 'supabase/migrations/029_rm_account_master_stats_raw.sql')),
  },
  {
    name: 'Sync Active: tanpa detect/count/merge device group ids',
    ok:
      !read('src/services/syncFlowService.ts').includes('detectGroupsAndBuildSyncPayload') &&
      !read('src/lib/accountMonitoringEngine.ts').includes('export async function refreshAccountMetrics') &&
      !fs.existsSync(path.join(root, 'src/lib/syncAccountFlow.ts')) &&
      !fs.existsSync(path.join(root, 'src/lib/mergeDeviceGroupIdsIntoDaily.ts')) &&
      !fs.existsSync(path.join(root, 'electron/main/scraper/countWhatsApp.ts')) &&
      !read('electron/main/scraper/index.ts').includes('scraper:count-groups'),
  },
  {
    name: 'Scrape Now: progress fingerprint + FloodWait heartbeat + checkpoint',
    ok:
      read('electron/main/scraper/telegramScrape.ts').includes('lastFingerprint') &&
      read('python-sidecar/telegram_scraper.py').includes('_sleep_flood_with_heartbeat') &&
      read('electron/main/scraper/scrapeCheckpoint.ts').includes('loadScrapeCheckpoint') &&
      read('electron/main/scraper/whatsappScrape.ts').includes('loadScrapeCheckpoint') &&
      read('electron/main/scraper/deviceGroupScale.ts').includes('formatScrapeEtaLabel') &&
      read('src/lib/accountScraper.ts').includes('Commit scrape daily'),
  },
  {
    name: 'Modal QR besar + refresh overlay',
    ok:
      read('src/index.css').includes('platform-login-qr-skeleton') &&
      read('src/components/group-monitoring/PlatformLoginModal.tsx').includes('refreshQrManual'),
  },
  {
    name: 'Scrape sukses: applyResult grid (kontrak §5 — tanpa refresh DB terpisah)',
    ok:
      syncFlow.includes("outcome.kind === 'success'") &&
      syncFlow.includes('applyResult(groupId, account.id, outcome.result') &&
      !/await onAccountGridRefresh\?\.\(dbAccountId\)/.test(syncFlow) &&
      !/refreshAccountAfterDailyWrite|refreshAccountGrid\(/.test(syncFlow),
  },
  {
    name: 'Scrape manual sukses: UI catch-up Matrix/Ops (bukan path auto scrape)',
    ok:
      syncFlow.includes('onManualScrapeUiCatchUp') &&
      syncFlow.includes('onManualScrapeUiCatchUpRef.current?.()') &&
      read('src/providers/GroupMonitoringProvider.tsx').includes(
        'onManualScrapeUiCatchUp: scheduleMonitoringReload',
      ) &&
      !read('src/lib/runAutoAccountScraper.ts').includes('onManualScrapeUiCatchUp') &&
      !read('src/lib/runAutoAccountScrape.ts').includes('onManualScrapeUiCatchUp'),
  },
  {
    name: 'Cancel scrape: abort device sebelum release execute slot',
    ok:
      /scraper\?\.cancel[\s\S]*releaseExecuteSlot/.test(
        syncFlow.slice(syncFlow.indexOf('confirmCancelScrape')),
      ) &&
      !/confirmCancelScrape[\s\S]*?releaseExecuteSlot[\s\S]*?scraper\?\.cancel/.test(
        syncFlow.slice(
          syncFlow.indexOf('confirmCancelScrape'),
          syncFlow.indexOf('dismissScrapeCancelled'),
        ),
      ),
  },
  {
    name: 'Realtime master flush: re-queue saat skip karena suspended',
    ok: (() => {
      const rt = read('src/hooks/useRealtimeMonitoring.ts');
      return (
        rt.includes('pendingBrandPlatform.add(key)') &&
        rt.includes('deferredAny') &&
        rt.includes('pendingBrandPlatformRef')
      );
    })(),
  },
  {
    name: 'Modal Admin vs master: fetchAccountGroupLinks master-only + dedupe',
    ok: (() => {
      const links = read('src/lib/accountGroupLinks.ts');
      const start = links.indexOf('export async function fetchAccountGroupLinks');
      const fn = links.slice(start, start + 1200);
      return (
        links.includes('dedupeMasterRowsByGroupId') &&
        fn.includes('inMaster: true') &&
        !fn.includes('inMaster: false')
      );
    })(),
  },
  {
    name: 'Scrape pipeline: invite_link + rm_commit_account_scrape atomik',
    ok: (() => {
      const scraper = read('src/lib/accountScraper.ts');
      const wa = read('electron/main/scraper/whatsappScrape.ts');
      const userLane = wa.slice(0, wa.indexOf('runWhatsAppScrapeAutoLane'));
      return (
        scraper.includes('invite_link: group.invite_link') &&
        scraper.includes("rpc('rm_commit_account_scrape'") &&
        !userLane.includes('freshBoot: true') &&
        wa.includes('runWhatsAppScrapeAutoLane') &&
        wa.includes('browserPool: \'auto\'')
      );
    })(),
  },
  {
    name: 'Kontrak: execute slot pool per platform (max 10 WA + 10 TG) + IPC',
    ok: (() => {
      const pool = read('electron/main/automation/executeSlotPool.ts');
      const policy = read('src/config/executeSlotPolicy.ts');
      const concurrency = read('src/config/deviceConcurrencyPolicy.ts');
      const gate = read('src/lib/userActionGate.ts');
      const client = read('src/lib/executeSlotClient.ts');
      const waPool = read('electron/main/platformLogin/waBrowserPool.ts');
      const tgSlots = read('electron/main/platformLogin/tgExecuteSlots.ts');
      return (
        pool.includes('getMaxWaBrowserSlots') &&
        pool.includes('getMaxTgExecuteSlots') &&
        concurrency.includes('DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM = 10') &&
        concurrency.includes('HARD_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM = 10') &&
        policy.includes('DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM') &&
        gate.includes('DEFAULT_MAX_EXECUTE_SLOTS') &&
        client.includes('acquireOrWait') &&
        waPool.includes('DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM') &&
        tgSlots.includes('DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM') &&
        /fifoWaiters\.push[\s\S]{0,120}drainExecuteSlotFifo/.test(pool)
      );
    })(),
  },
  {
    name: 'Kontrak: scrape error lepaskan slot; spinner tahan sampai modal ditutup',
    ok:
      syncFlow.includes('deferSlotRelease = true') &&
      syncFlow.includes('void releaseExecuteSlot(account.id)') &&
      /if \(!holdRowStateForLogin\)[\s\S]*?void releaseExecuteSlot\(account\.id\)[\s\S]*?if \(!deferSlotRelease\)/.test(
        syncFlow,
      ) &&
      syncFlow.includes('releaseExecuteSlot(target.account.id)'),
  },
  {
    name: 'Kontrak: sync valid sessionOnly sebelum modal Now/Later',
    ok: syncFlow.includes('sessionOnly: true'),
  },
  {
    name: 'Kontrak: job queue per-akun (bukan global block)',
    ok: read('src/lib/automationJobQueueClient.ts').includes('isAccountJobActive'),
  },
  {
    name: 'Auto Sync: lane terpisah + brand slots (max 6/platform) paralel',
    ok: (() => {
      const autoHook = read('src/hooks/useAutoAccountSync.ts');
      const autoScrape = read('src/lib/runAutoAccountScrape.ts');
      const autoScraper = read('src/lib/runAutoAccountScraper.ts');
      const brandSettings = read('src/config/autoScrapeBrandSettings.ts');
      const concurrency = read('src/config/deviceConcurrencyPolicy.ts');
      const autoPool = read('electron/main/platformLogin/waAutoScrapeBrowserPool.ts');
      const waLogin = read('electron/main/platformLogin/whatsapp.ts');
      const lane = read('electron/main/scraper/autoScrapeLane.ts');
      const schedule = read('src/config/autoScrapeSchedule.ts');
      const policy = read('src/config/autoScrapePolicy.ts');
      const teardown = read('src/lib/autoScrapeDeviceTeardown.ts');
      const scraperMain = read('electron/main/scraper/index.ts');
      const provider = read('src/providers/GroupMonitoringProvider.tsx');
      return (
        autoHook.includes('collectAutoScrapeTargets') &&
        autoHook.includes('readAutoSyncEnabled') &&
        autoHook.includes('isBrandAccountStillSelected') &&
        autoHook.includes('runAutoAccountScrape') &&
        autoHook.includes('getMaxAutoScrapeBrandSlotsPerPlatform') &&
        autoHook.includes('selectedByPlatform') &&
        autoHook.includes('runBrandPlatformSequential') &&
        autoHook.includes('teardownAllActive') &&
        autoHook.includes('activeAutoScrapeAccountIds') &&
        autoHook.includes('Map<string, ActiveAutoScrapeEntry>') &&
        provider.includes('activeAutoScrapeAccountIds') &&
        brandSettings.includes('getMaxAutoScrapeBrandSlotsPerPlatform') &&
        brandSettings.includes('session_invalid') &&
        concurrency.includes('DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM = 6') &&
        autoPool.includes('DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM') &&
        waLogin.includes("browserPool === 'auto'") &&
        waLogin.includes('withWaAutoScrapeBrowserSlot') &&
        waLogin.includes('withBrowserSlot') &&
        lane.includes('maxSessionsPerPlatform') &&
        autoScrape.includes('runAutoAccountScraper') &&
        autoScrape.includes("kind: 'start'") &&
        autoScrape.includes('AUTO_SCRAPE_LANE_BUSY') &&
        autoScrape.includes("account.status !== 'active'") &&
        !autoScrape.includes('acquireExecuteSlotWithinMs') &&
        autoScraper.includes('runAuto') &&
        policy.includes('gapAfterAccountMs') &&
        teardown.includes('cancelAuto') &&
        !teardown.includes('releaseExecuteSlot') &&
        scraperMain.includes('scraper:run-auto') &&
        scraperMain.includes('scraper:cancel-auto') &&
        scraperMain.includes('isAutoScrapeActiveForSession') &&
        scraperMain.includes('stopWhatsAppLogin') &&
        schedule.includes('shouldTriggerAutoScrapeCycle') &&
        !autoHook.includes('runAccountSyncCheck') &&
        !autoHook.includes('activeAutoScrapeAccountId:')
      );
    })(),
  },
  {
    name: 'Auto scrape isolasi penuh vs manual scrape + job queue',
    ok: (() => {
      const autoScrape = read('src/lib/runAutoAccountScrape.ts');
      const autoScraper = read('src/lib/runAutoAccountScraper.ts');
      const autoHook = read('src/hooks/useAutoAccountSync.ts');
      const teardown = read('src/lib/autoScrapeDeviceTeardown.ts');
      const scraperMain = read('electron/main/scraper/index.ts');
      const lane = read('electron/main/scraper/autoScrapeLane.ts');
      const cancelAuto = read('electron/main/scraper/autoScrapeCancel.ts');
      const cancelUser = read('electron/main/scraper/scrapeCancel.ts');
      const userPool = read('electron/main/platformLogin/waBrowserPool.ts');
      const autoPool = read('electron/main/platformLogin/waAutoScrapeBrowserPool.ts');
      const jqStore = read('electron/main/automation/jobQueueStore.ts');
      const jqRunner = read('electron/main/automation/jobQueueRunner.ts');
      const jqGuard = read('electron/main/automation/jobQueueGuard.ts');
      const syncFlow = read('src/hooks/useAccountSyncFlow.ts');
      return (
        // Auto path: tidak ambil execute slot user / tidak enqueue job queue
        !autoScrape.includes('acquireExecuteSlot') &&
        !autoScraper.includes('acquireExecuteSlot') &&
        !autoHook.includes('acquireExecuteSlot') &&
        !autoHook.includes('runAutomationJob') &&
        !autoHook.includes("lane: 'user'") &&
        !teardown.includes('releaseExecuteSlot') &&
        !teardown.includes('acquireExecuteSlot') &&
        autoScraper.includes("lane: 'auto'") &&
        // IPC + cancel registry terpisah
        scraperMain.includes("ipcMain.handle('scraper:run-auto'") &&
        scraperMain.includes("ipcMain.handle('scraper:run'") &&
        scraperMain.includes('registerActiveAutoScrape') &&
        scraperMain.includes('registerActiveScrape') &&
        scraperMain.includes('executeAutoScrapeRun') &&
        !scraperMain
          .slice(
            scraperMain.indexOf('async function executeAutoScrapeRun'),
            scraperMain.indexOf("ipcMain.handle('scraper:run'"),
          )
          .includes('guardAccountExecute') &&
        cancelAuto.includes('registerActiveAutoScrape') &&
        cancelUser.includes('registerActiveScrape') &&
        // Chrome pool terpisah
        userPool.includes('withWaBrowserSlot') &&
        autoPool.includes('withWaAutoScrapeBrowserSlot') &&
        !autoPool.includes('withWaBrowserSlot') &&
        // Saling hormati per akun (bukan saling makan kuota global)
        lane.includes('resolveUserLaneBlockForAutoScrape') &&
        lane.includes('isExecuteSlotActiveForAccount') &&
        lane.includes('isAccountJobQueueBusy') &&
        lane.includes('isScrapeActiveForSession') &&
        jqStore.includes('isAutoScrapeActiveForSession') &&
        jqRunner.includes('isAutoScrapeActiveForSession') &&
        jqGuard.includes('isAutoScrapeActiveForSession') &&
        // Manual sync tetap pakai execute slot user
        syncFlow.includes('acquireExecuteSlot')
      );
    })(),
  },
];

let failed = 0;

console.log('--- logic_sync_scraper.txt ---');
for (const [label, ok] of specChecks) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}

console.log('\n--- Implementasi ---');
for (const c of implChecks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nSync/scraper spec alignment checks passed.');
