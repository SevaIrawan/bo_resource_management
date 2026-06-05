/**
 * Kontrak ticket issue: master vs daily per akun, missing_group + invite_link.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const reconcile = read('src/lib/reconcileTickets.ts');
const provider = read('src/providers/GroupMonitoringProvider.tsx');
const groups = read('src/lib/ticketGroups.ts');
const engine = read('src/lib/accountMonitoringEngine.ts');
const realtime = read('src/hooks/useRealtimeMonitoring.ts');

const checks = [
  {
    name: 'missing_group: bandingkan master vs daily (id + invite + nama)',
    ok:
      reconcile.includes("ticketType: 'missing_group'") &&
      reconcile.includes('groupLink: m.invite_link') &&
      reconcile.includes('findDailyRowForMaster'),
  },
  {
    name: 'Tidak ada group_count_mismatch di reconcile',
    ok: !reconcile.includes("ticketType: 'group_count_mismatch'"),
  },
  {
    name: 'Batch insert missing_group (skala ribuan grup)',
    ok:
      reconcile.includes('batchUpsertOpenTicketsByGroupId') &&
      reconcile.includes('TICKET_INSERT_CHUNK'),
  },
  {
    name: 'Lima tipe ticket (tanpa group_count_mismatch)',
    ok:
      reconcile.includes("ticketType: 'daily_junk_group'") &&
      reconcile.includes("ticketType: 'missing_group'") &&
      reconcile.includes("ticketType: 'not_admin'") &&
      reconcile.includes('resolveLegacyCountMismatchTickets'),
  },
  {
    name: 'reconcileOpenTicketsForUser semua akun aktif',
    ok: reconcile.includes('export async function reconcileOpenTicketsForUser'),
  },
  {
    name: 'Provider: reconcile saat load + refresh tab Ticket',
    ok:
      provider.includes('runTicketReconcile') &&
      provider.includes('scheduleTicketReconcile') &&
      provider.includes('reconcileOpenTicketsForUser'),
  },
  {
    name: 'UI: satu kartu issue per akun+jenis (banyak baris link)',
    ok: groups.includes('ticketGroupKey') && groups.includes('group.lines'),
  },
  {
    name: 'Sync: merge group_id device ke daily (issue ikut update)',
    ok:
      engine.includes('mergeDeviceGroupIdsIntoDaily') &&
      engine.includes('device.groupIds'),
  },
  {
    name: 'Provider: reconcile dulu lalu reload ticket',
    ok:
      provider.includes('reconcileTicketsForAccountFromDb') &&
      provider.includes('applyAccountGroupsDailyPatch') &&
      provider.includes('await reloadTickets()'),
  },
  {
    name: 'Sync flow: await onTicketsReload(dbAccountId)',
    ok:
      /await onTicketsReload\?\.\(dbAccountId/.test(read('src/hooks/useAccountSyncFlow.ts')) &&
      /refreshIssues\(dbAccountId/.test(
        read('src/components/group-monitoring/AccountMonitoringBody.tsx'),
      ),
  },
  {
    name: 'Scrape: refresh Issue setelah clearRowProcessing',
    ok: read('src/hooks/useAccountSyncFlow.ts').includes('scrapeSucceeded && dbAccountId'),
  },
  {
    name: 'Realtime tickets: reload kartu segera',
    ok:
      realtime.includes('table: TABLES.tickets') &&
      realtime.includes('onTicketsChangeRef.current()'),
  },
  {
    name: 'batchUpsert: keepIds hanya dari rows masih missing (bukan semua open lama)',
    ok:
      reconcile.includes('Hanya group_id yang masih issue') &&
      !reconcile.includes('keepIds.add(gid);\n    }\n  }\n\n  const toInsert'),
  },
  {
    name: 'Match master↔daily: invite link + nama (masterDailyMatch)',
    ok:
      reconcile.includes('findDailyRowForMaster') &&
      fs.existsSync(path.join(root, 'src/lib/masterDailyMatch.ts')),
  },
  {
    name: 'Realtime daily: reconcile akun lalu patch groups',
    ok:
      realtime.includes('onAccountDailyChangedRef.current?.(accountId)') &&
      !realtime.includes('onTicketsChangeRef.current();\n            notifyChange();'),
  },
  {
    name: 'Realtime scrape selesai → reconcile akun + reload ticket',
    ok:
      realtime.includes('table: TABLES.scrapeRuns') &&
      realtime.includes("status === 'completed'") &&
      realtime.includes('onAccountDailyChangedRef.current?.(accountId)'),
  },
  {
    name: 'Detail ticket: double-click modal + export Excel',
    ok:
      fs.existsSync(path.join(root, 'src/components/group-monitoring/TicketIssueDetailModal.tsx')) &&
      read('src/components/group-monitoring/TicketCard.tsx').includes('onDoubleClick') &&
      read('src/components/group-monitoring/TicketCard.tsx').includes('exportTicketGroupExcel') &&
      read('src/lib/ticketExportRows.ts').includes('ticketGroupToExportRows'),
  },
  {
    name: 'Scrape selesai → await refreshIssues (reconcile + reload)',
    ok:
      read('src/hooks/useAccountSyncFlow.ts').includes('scrapeSucceeded && dbAccountId') &&
      read('src/hooks/useAccountSyncFlow.ts').includes('await onTicketsReload?.(dbAccountId)'),
  },
  {
    name: 'Issue hilang → resolveTickets tutup open ticket',
    ok:
      reconcile.includes('async function resolveTickets') &&
      reconcile.includes("status: 'resolved'") &&
      reconcile.includes('await resolveTickets({'),
  },
  {
    name: 'Realtime snapshot: trigger reconcile issue',
    ok:
      realtime.includes('patchAccountSnapshotInGroups') &&
      realtime.includes('onIssueReconcileRef'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nTicket reconcile checks passed.');
