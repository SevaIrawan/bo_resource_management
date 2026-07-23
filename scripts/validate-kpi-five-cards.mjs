/**
 * KPI dashboard: Account 4 kartu (brands, accounts, logout, notAligned).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const kpis = fs.readFileSync(path.join(root, 'src/lib/monitoringKpis.ts'), 'utf8');
const defaults = fs.readFileSync(path.join(root, 'src/config/groupMonitoringKpis.ts'), 'utf8');
const grid = fs.readFileSync(path.join(root, 'src/components/group-monitoring/KpiGrid.tsx'), 'utf8');
const en = fs.readFileSync(path.join(root, 'src/i18n/locales/en.ts'), 'utf8');
const filterTs = fs.readFileSync(path.join(root, 'src/lib/filterAccountGroups.ts'), 'utf8');
const slicer = fs.readFileSync(
  path.join(root, 'src/components/group-monitoring/AccountSlicerHeader.tsx'),
  'utf8',
);

const accountReturn = kpis.slice(kpis.indexOf('export function computeAccountKpis'));

function countLabelKeys(block) {
  return (block.match(/labelKey:/g) ?? []).length;
}

const checks = [
  {
    name: 'Account KPI: 4 kartu logout + notAligned (exception insight)',
    ok:
      countLabelKeys(accountReturn) === 4 &&
      accountReturn.includes('kpi.account.logout') &&
      accountReturn.includes('kpi.account.notAligned') &&
      !accountReturn.includes('kpi.account.issue') &&
      !accountReturn.includes('kpi.account.active') &&
      !accountReturn.includes('kpi.account.aligned'),
  },
  {
    name: 'i18n KPI Logout / Not Aligned',
    ok: en.includes("logout: 'Logout'") && en.includes("notAligned: 'Not Aligned'"),
  },
  {
    name: 'Slicer Status setelah Session (Aligned / Not Aligned)',
    ok:
      filterTs.includes("status: 'all'") &&
      filterTs.includes("filters.status === 'aligned'") &&
      filterTs.includes("filters.status === 'not_aligned'") &&
      slicer.includes('ACCOUNT_STATUS_OPTIONS') &&
      /sessionOptions[\s\S]*statusOptions/.test(slicer) &&
      /accountFilters\.session[\s\S]*accountFilters\.status/.test(slicer),
  },
  {
    name: 'Tidak ada computeTicketKpis',
    ok: !kpis.includes('computeTicketKpis'),
  },
  {
    name: 'KPI dari computeAccountKpis (tanpa ACCOUNT_KPIS stub)',
    ok: !defaults.includes('ACCOUNT_KPIS') && defaults.includes('export interface KpiItem'),
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
