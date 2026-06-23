/**
 * KPI dashboard: Account 4 kartu (brands, accounts, active, aligned).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const kpis = fs.readFileSync(path.join(root, 'src/lib/monitoringKpis.ts'), 'utf8');
const defaults = fs.readFileSync(path.join(root, 'src/config/groupMonitoringKpis.ts'), 'utf8');
const grid = fs.readFileSync(path.join(root, 'src/components/group-monitoring/KpiGrid.tsx'), 'utf8');

const accountReturn = kpis.slice(kpis.indexOf('export function computeAccountKpis'));

function countLabelKeys(block) {
  return (block.match(/labelKey:/g) ?? []).length;
}

const checks = [
  {
    name: 'Account KPI: 4 kartu, tanpa kpi.account.issue',
    ok: countLabelKeys(accountReturn) === 4 && !accountReturn.includes('kpi.account.issue'),
  },
  {
    name: 'Tidak ada computeTicketKpis',
    ok: !kpis.includes('computeTicketKpis'),
  },
  {
    name: 'ACCOUNT_KPIS default: 4 item',
    ok: (defaults.match(/kpi\.account\./g) ?? []).length === 4,
  },
  {
    name: 'Tidak ada TICKET_KPIS',
    ok: !defaults.includes('TICKET_KPIS') && !defaults.includes('kpi.ticket.'),
  },
  {
    name: 'KpiGrid md:grid-cols-4',
    ok: grid.includes('md:grid-cols-4') && !grid.includes('xl:grid-cols-5'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nKPI card checks passed.');
