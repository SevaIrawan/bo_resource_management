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
const syncFlow = read('src/hooks/useAccountSyncFlow.ts');
const manual = read('src/lib/manualSyncFlow.ts');

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
    name: 'handleLoginSuccess pakai quickDeviceCount',
    ok: /quickDeviceCount:\s*true/.test(syncFlow),
  },
  {
    name: 'Timeout sync setelah login skala 2000 grup',
    ok: syncFlow.includes('loginSyncAfterTimeoutMs'),
  },
  {
    name: 'Fallback scrape prompt jika persist OK tapi count gagal',
    ok: syncFlow.includes('persistedToDb') && syncFlow.includes('postSyncModalStep'),
  },
  {
    name: 'detectGroups meneruskan quickDeviceCount',
    ok: manual.includes('quickDeviceCount'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nPost-login sync flow checks passed.');
