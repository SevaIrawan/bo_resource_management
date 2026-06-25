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
    name: 'quick sync skip merge device group ids',
    ok:
      read('src/lib/accountMonitoringEngine.ts').includes('skipMergeDeviceGroups') &&
      read('electron/main/scraper/countWhatsApp.ts').includes("mode === 'quick'") &&
      !/mode === 'quick'[\s\S]{0,120}groupIds/.test(read('electron/main/scraper/countWhatsApp.ts')),
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
      !/await onAccountGridRefresh\?\.\(dbAccountId\)/.test(syncFlow),
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
      return (
        scraper.includes('invite_link: group.invite_link') &&
        scraper.includes("rpc('rm_commit_account_scrape'") &&
        !wa.includes('freshBoot: true')
      );
    })(),
  },
  {
    name: 'Kontrak: execute slot pool max 4 + IPC (cursor-prompt-gm-master)',
    ok: (() => {
      const pool = read('electron/main/automation/executeSlotPool.ts');
      const gate = read('src/lib/userActionGate.ts');
      const client = read('src/lib/executeSlotClient.ts');
      return (
        pool.includes('getMaxWaBrowserSlots') &&
        gate.includes('MAX_EXECUTE_SLOTS = 4') &&
        client.includes('acquireOrWait')
      );
    })(),
  },
  {
    name: 'Kontrak: scrape error tahan slot sampai modal ditutup',
    ok:
      syncFlow.includes('deferSlotRelease = true') &&
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
