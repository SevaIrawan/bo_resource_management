/**
 * Tombol Refresh: notifikasi pembaruan + dropdown Update now / Refresh.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const btn = read('src/components/ui/MonitoringRefreshButton.tsx');
const providers = read('src/providers/DashboardProviders.tsx');
const realtime = read('src/hooks/useRealtimeMonitoring.ts');
const i18n = read('src/i18n/locales/en.ts');

const checks = [
  { name: 'Dropdown Update now + Refresh', ok: btn.includes('updateNow') && btn.includes('refreshMenu') },
  { name: 'Notifikasi dot saat ada update', ok: btn.includes('monitoring-refresh-update-dot') && btn.includes('showMenu') },
  { name: 'Pending data context', ok: providers.includes('MonitoringPendingContext') },
  { name: 'Realtime memicu onDataChangeNotice', ok: realtime.includes('onDataChangeNotice') },
  { name: 'installUpdate IPC', ok: read('electron/preload/index.ts').includes('installUpdate') },
  { name: 'i18n updateNow / dataUpdatesPending', ok: i18n.includes('updateNow') && i18n.includes('dataUpdatesPending') },
  { name: 'Post-login reconcile tickets', ok: read('src/hooks/useAccountSyncFlow.ts').includes('reconcileTicketsForAccount') && read('src/hooks/useAccountSyncFlow.ts').includes('brandIdAfterLogin') },
  { name: 'Load app: background reconcileOpenTicketsForUser', ok: read('src/providers/GroupMonitoringProvider.tsx').includes('scheduleTicketReconcile') && read('src/providers/GroupMonitoringProvider.tsx').includes('reconcileOpenTicketsForUser') },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nRefresh notification checks passed.');
