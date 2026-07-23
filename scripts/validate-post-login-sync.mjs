/**
 * Alur: login QR → persist session UI+DB saja → modal Scrape now / Later.
 * Tidak hitung grup di device pasca-login. Scrape nyata hanya lewat Scrape Now.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const scraperIdx = read('electron/main/scraper/index.ts');
const syncFlow = read('src/services/syncFlowService.ts');
const loginFlow = read('src/services/loginFlowService.ts');
const loginHook = read('src/hooks/useAccountSyncFlow.ts');
const platformLogin = read('src/hooks/usePlatformLogin.ts');
const policy = read('src/config/syncScraperPolicy.ts');
const en = read('src/i18n/locales/en.ts');
const clearSession = read('src/lib/clearAccountSession.ts');

const applyDailyBody = (() => {
  const start = loginFlow.indexOf('export async function applyDailyMetricsAfterLogin');
  const next = loginFlow.indexOf('\nexport async function', start + 1);
  return start >= 0 ? loginFlow.slice(start, next > start ? next : undefined) : '';
})();

const dismissBody = (() => {
  const start = loginHook.indexOf('const dismissScrapePrompt');
  const next = loginHook.indexOf('const requestCancelScrape', start);
  return start >= 0 ? loginHook.slice(start, next > start ? next : undefined) : '';
})();

const checks = [
  {
    name: 'IPC count-groups / cancel-count sudah dihapus (Sync tanpa device count)',
    ok:
      !scraperIdx.includes('scraper:count-groups') &&
      !scraperIdx.includes('countWhatsAppGroupsQuick') &&
      !fs.existsSync(path.join(root, 'electron/main/scraper/countWhatsApp.ts')) &&
      !fs.existsSync(path.join(root, 'src/lib/runAccountCount.ts')),
  },
  {
    name: 'Clear Session: cancel scrape/auto saja (tanpa cancelCount mati)',
    ok:
      clearSession.includes('scraper') &&
      clearSession.includes('cancelAuto') &&
      !clearSession.includes('cancelDeviceGroupCount') &&
      !clearSession.includes('runAccountCount'),
  },
  {
    name: 'Post-login Sync: tanpa quickDeviceCount / detect device',
    ok:
      applyDailyBody.length > 0 &&
      !applyDailyBody.includes('quickDeviceCount') &&
      !applyDailyBody.includes('detectGroupsAndBuildSyncPayload') &&
      applyDailyBody.includes('fetchHasDailyData'),
  },
  {
    name: 'Later: sessionOnly UI + markPlatformSessionSynced DB',
    ok:
      dismissBody.includes('sessionOnly: true') &&
      dismissBody.includes('markPlatformSessionSynced') &&
      dismissBody.includes('patchAccountSessionInGroups'),
  },
  {
    name: 'Fallback scrape prompt jika persist OK tapi langkah lanjut gagal',
    ok: loginHook.includes('persistedToDb') && loginHook.includes('resolvePostLoginModalStep'),
  },
  {
    name: 'Sync service: rantai detectGroups/completeSync/SYNC_TIMED_OUT dihapus',
    ok:
      !syncFlow.includes('detectGroupsAndBuildSyncPayload') &&
      !syncFlow.includes('completeSyncAfterLiveSession') &&
      !syncFlow.includes('SYNC_TIMED_OUT') &&
      !/kind:\s*'device_busy'/.test(syncFlow),
  },
  {
    name: 'Policy: tanpa syncDetect/postLoginDetect legacy',
    ok: !policy.includes('syncDetect') && !policy.includes('postLoginDetect'),
  },
  {
    name: 'WA confirming timeout tetap (tidak skala grup)',
    ok:
      policy.includes('waLoginConfirming') &&
      policy.includes('timeoutMs') &&
      platformLogin.includes('waLoginConfirmingTimeoutMs'),
  },
  {
    name: 'i18n loginConfirmingTimeout (en)',
    ok: en.includes('loginConfirmingTimeout'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nPost-login sync flow checks passed.');
