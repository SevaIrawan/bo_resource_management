/**
 * Tombol Refresh: refresh tab aktif + dot jika ada data baru dari server.
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
  { name: 'Refresh tanpa dropdown', ok: !btn.includes('monitoring-refresh-menu') && btn.includes('refreshActiveTab') },
  { name: 'Tanpa dot notifikasi di tombol', ok: !btn.includes('monitoring-refresh-update-dot') },
  { name: 'Pending data context', ok: providers.includes('MonitoringPendingContext') },
  { name: 'Realtime memicu onDataChangeNotice', ok: realtime.includes('onDataChangeNotice') },
  { name: 'installUpdate IPC', ok: read('electron/preload/index.ts').includes('installUpdate') },
  { name: 'i18n updateNow / dataUpdatesPending', ok: i18n.includes('updateNow') && i18n.includes('dataUpdatesPending') },
  {
    name: 'Post-login reconcile tickets',
    ok: (() => {
      const syncFlow = read('src/hooks/useAccountSyncFlow.ts');
      return (
        syncFlow.includes('await onTicketsReload?.(dbAccountId') &&
        syncFlow.includes('await onTicketsReload?.(outcome.dbAccountId, account.id)')
      );
    })(),
  },
  {
    name: 'Load app: ticket engine + reconcile saat refresh tab Ticket',
    ok:
      read('src/providers/GroupMonitoringProvider.tsx').includes('runTicketReconcile') &&
      read('src/providers/GroupMonitoringProvider.tsx').includes('reconcileOpenTicketsForUser') &&
      read('src/providers/GroupMonitoringProvider.tsx').includes('buildTicketSummariesForUser'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nRefresh notification checks passed.');
