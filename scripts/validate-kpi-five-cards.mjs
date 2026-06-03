/**
 * KPI dashboard: Account 5 kartu (tanpa Issue), Ticket 5 kartu (tanpa Groups to handle).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const kpis = fs.readFileSync(path.join(root, 'src/lib/monitoringKpis.ts'), 'utf8');
const defaults = fs.readFileSync(path.join(root, 'src/config/groupMonitoringKpis.ts'), 'utf8');
const grid = fs.readFileSync(path.join(root, 'src/components/group-monitoring/KpiGrid.tsx'), 'utf8');

const accountReturn = kpis.slice(
  kpis.indexOf('export function computeAccountKpis'),
  kpis.indexOf('export function computeTicketKpis'),
);
const ticketReturn = kpis.slice(kpis.indexOf('export function computeTicketKpis'));

function countLabelKeys(block) {
  return (block.match(/labelKey:/g) ?? []).length;
}

const checks = [
  {
    name: 'Account KPI: 5 kartu, tanpa kpi.account.issue',
    ok: countLabelKeys(accountReturn) === 5 && !accountReturn.includes('kpi.account.issue'),
  },
  {
    name: 'Ticket KPI: 5 kartu, tanpa kpi.ticket.detailRows',
    ok: countLabelKeys(ticketReturn) === 5 && !ticketReturn.includes('kpi.ticket.detailRows'),
  },
  {
    name: 'ACCOUNT_KPIS default: 5 item',
    ok: (defaults.match(/kpi\.account\./g) ?? []).length === 5,
  },
  {
    name: 'TICKET_KPIS default: 5 item',
    ok: (defaults.match(/kpi\.ticket\./g) ?? []).length === 5,
  },
  {
    name: 'KpiGrid xl:grid-cols-5',
    ok: grid.includes('xl:grid-cols-5') && !grid.includes('xl:grid-cols-6'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nKPI five-card checks passed.');
