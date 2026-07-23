/**
 * Group matrix (Account header klik Group) — Acc=All, Full Group|Admin, filter kolom Acc.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const matrix = read('src/components/group-monitoring/ReportingJoinMatrixTable.tsx');
const modal = read('src/components/group-monitoring/BrandMasterGroupsModal.tsx');
const provider = read('src/providers/GroupMonitoringProvider.tsx');
const loadReport = read('src/lib/loadJoinGroupReport.ts');
const monitoringType = read('src/types/monitoring.ts');
const tabs = read('src/components/ui/MonitoringTabs.tsx');
const en = read('src/i18n/locales/en.ts');

const checks = [
  {
    name: 'Tab Reporting dihapus — hanya Account + Operations',
    ok:
      monitoringType.includes("'account'") &&
      monitoringType.includes("'operations'") &&
      !monitoringType.includes("'reporting'") &&
      !tabs.includes("'reporting'") &&
      !fs.existsSync(path.join(root, 'src/components/group-monitoring/ReportingMonitoringPanel.tsx')),
  },
  {
    name: 'Modal Group: brand+platform scoped, semua Acc (tanpa Acc slicer)',
    ok:
      modal.includes('loadJoinGroupMatrix') &&
      modal.includes('ReportingJoinMatrixTable') &&
      modal.includes("['full_group', 'full_admin']") &&
      modal.includes('.filter((account) => account.platform === platform)') &&
      !modal.includes('REPORTING_ACCOUNT_ALL') &&
      !modal.includes('groupNameSearch') &&
      !modal.includes('stockStatus'),
  },
  {
    name: 'Matrix filter kolom Acc Yes/No/All + empty back',
    ok:
      matrix.includes('showFilteredEmpty') &&
      matrix.includes('ReportingTableShell') &&
      matrix.includes('join-report-table__filter-empty-btn') &&
      matrix.includes('onColumnFilterChange(null)') &&
      modal.includes('filterReportingMatrixRows') &&
      modal.includes('columnFilter={columnFilter}'),
  },
  {
    name: 'Matrix filter empty: i18n matrixFilterClear',
    ok: en.includes('matrixFilterClear') && en.includes('Back to all groups'),
  },
  {
    name: 'Realtime: rm-reporting-reload tetap untuk matrix modal',
    ok:
      provider.includes('dispatchReportingReload') &&
      provider.includes('scheduleReportingReload') &&
      modal.includes('rm-reporting-reload') &&
      read('src/lib/monitoringRealtimeEvents.ts').includes("new Event('rm-reporting-reload')"),
  },
  {
    name: 'Matrix: fetch langsung Supabase paged + ORDER BY (bukan cache)',
    ok:
      loadReport.includes('fetchAllSupabaseRows') &&
      loadReport.includes('dedupeDailyRowsByGroupIdKeepLatest') &&
      read('src/lib/supabasePagedSelect.ts').includes('.range(from, to)') &&
      read('src/lib/supabasePagedSelect.ts').includes('stableOrderForTable'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nReporting matrix checks passed.');
