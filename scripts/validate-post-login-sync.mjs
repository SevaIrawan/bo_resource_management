/**
 * Alur: login QR WA → count cepat → modal Scrape now / Later (bukan timeout 120s).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const waCount = read('electron/main/scraper/countWhatsApp.ts');
const scraperIdx = read('electron/main/scraper/index.ts');
const syncFlow = read('src/services/syncFlowService.ts');
const loginFlow = read('src/services/loginFlowService.ts');
const loginHook = read('src/hooks/useAccountSyncFlow.ts');
const platformLogin = read('src/hooks/usePlatformLogin.ts');
const policy = read('src/config/syncScraperPolicy.ts');
const en = read('src/i18n/locales/en.ts');

const checks = [
  {
    name: 'countWhatsAppGroupsQuick ada',
    ok: waCount.includes('export async function countWhatsAppGroupsQuick'),
  },
  {
    name: 'IPC count-groups mendukung quick',
    ok: scraperIdx.includes('quick?: boolean') && scraperIdx.includes('countWhatsAppGroupsQuick'),
  },
  {
    name: 'Post-login pakai quickDeviceCount',
    ok: /quickDeviceCount:\s*true/.test(loginFlow),
  },
  {
    name: 'Timeout sync setelah login skala 3000 grup',
    ok: loginFlow.includes('postLoginSyncTimeoutMs'),
  },
  {
    name: 'Fallback scrape prompt jika persist OK tapi count gagal',
    ok: loginHook.includes('persistedToDb') && loginHook.includes('resolvePostLoginModalStep'),
  },
  {
    name: 'detectGroups meneruskan quickDeviceCount',
    ok: syncFlow.includes('quickDeviceCount'),
  },
  {
    name: 'WA confirming timeout >= 10 menit (akun besar)',
    ok: (() => {
      if (!platformLogin.includes('waLoginConfirmingTimeoutMs')) return false;
      if (!platformLogin.includes('waConfirmingMs')) return false;
      const m = policy.match(
        /waLoginConfirming:\s*\{[^}]*baseMs:\s*([\d_]+)[^}]*perGroupMs:\s*(\d+)/,
      );
      if (!m) return false;
      const base = Number(m[1].replace(/_/g, ''));
      const per = Number(m[2]);
      const at3000 = Math.min(1_200_000, base + 3000 * per);
      return at3000 >= 600_000;
    })(),
  },
  {
    name: 'i18n loginConfirmingTimeout (en)',
    ok: en.includes('loginConfirmingTimeout'),
  },
  {
    name: 'login sync timeout pakai estimasi grup',
    ok: loginFlow.includes('accountGroupEstimate'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nPost-login sync flow checks passed.');
