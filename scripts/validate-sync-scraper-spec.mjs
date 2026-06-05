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
const manual = read('src/lib/manualSyncFlow.ts');

const specChecks = [
  ['group + admin disebut di spec', /group.*admin|admin.*group/i.test(spec)],
  ['resume-empty untuk 0 grup', /resume-empty|0 grup/i.test(spec)],
  ['Now/Later bila ada data scrape', /Now.*Later|Scraper Now/i.test(spec)],
  ['WA auto-regenerate QR', /WA.*auto|auto-regenerate|qrUpdated/i.test(spec)],
  ['TG error tanpa auto-loop', /TG.*error|Telegram.*error/i.test(spec) && /auto-loop|refresh manual/i.test(spec)],
  ['probe device meski grid valid', /meski.*valid|grid masih/i.test(spec)],
  ['sync pending tampil —', /pending.*—|sync_state/i.test(spec)],
  ['timestamp tanpa (Terbaru)', /timestamp|MATCH/i.test(spec) && !/\(Terbaru\)/.test(spec)],
];

const implChecks = [
  {
    name: 'handleLoginSuccess tutup login (setStep idle) sebelum Now/Later',
    ok: /Tutup modal login/.test(syncFlow) && syncFlow.includes("setStep('idle')"),
  },
  {
    name: 'postSyncModalStep resume-empty vs scrape-prompt',
    ok: uiFlow.includes('shouldShowResumeOnlyEmpty') && syncFlow.includes('postSyncModalStep'),
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
    ok: syncFlow.includes('lastSyncAt: scrapedAt'),
  },
  {
    name: 'VALID+RUN device probe gagal → login',
    ok: manual.includes('checkDeviceSessionForValidColumn') && syncFlow.includes('showLoginModal'),
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
    name: 'RPC rm_account_master_stats + fetchMasterGroupStatsViaRpc',
    ok:
      fs.existsSync(path.join(root, 'supabase/migrations/028_rm_account_master_stats_rpc.sql')) &&
      read('src/lib/accountSyncData.ts').includes('fetchMasterGroupStatsViaRpc') &&
      !fs.existsSync(path.join(root, 'supabase/migrations/029_rm_account_master_stats_fast.sql')) &&
      read('supabase/migrations/028_rm_account_master_stats_rpc.sql').includes('daily_gid'),
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
    name: 'ticket reconcile setelah sync/scrape (await refreshIssues)',
    ok:
      /await onTicketsReload\?\.\(dbAccountId\)/.test(syncFlow) &&
      syncFlow.includes('scrapeSucceeded && dbAccountId'),
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
