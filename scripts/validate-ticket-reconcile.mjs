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

const checks = [
  {
    name: 'missing_group: bandingkan master vs daily by group_id + invite_link master',
    ok:
      reconcile.includes("ticketType: 'missing_group'") &&
      reconcile.includes('groupLink: m.invite_link') &&
      reconcile.includes('dailyByGid.get(gid)'),
  },
  {
    name: 'group_count_mismatch bila deviceY !== brandX (30 vs 1893)',
    ok:
      reconcile.includes("ticketType: 'group_count_mismatch'") &&
      reconcile.includes('deviceY !== brandX') &&
      reconcile.includes('Math.max(dailyY, snapY)'),
  },
  {
    name: 'Batch insert missing_group (skala ribuan grup)',
    ok:
      reconcile.includes('batchUpsertOpenTicketsByGroupId') &&
      reconcile.includes('TICKET_INSERT_CHUNK'),
  },
  {
    name: 'reconcileOpenTicketsForUser + snapshot deviceY',
    ok:
      reconcile.includes('export async function reconcileOpenTicketsForUser') &&
      reconcile.includes('deviceYByAccount'),
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
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nTicket reconcile checks passed.');
