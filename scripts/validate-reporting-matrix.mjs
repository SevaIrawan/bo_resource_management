/**
 * Reporting tab — matrix filter empty state + fresh DB reads.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const matrix = read('src/components/group-monitoring/ReportingJoinMatrixTable.tsx');
const panel = read('src/components/group-monitoring/ReportingMonitoringPanel.tsx');
const provider = read('src/providers/GroupMonitoringProvider.tsx');
const loadReport = read('src/lib/loadJoinGroupReport.ts');
const en = read('src/i18n/locales/en.ts');

const checks = [
  {
    name: 'Matrix filter empty: header tabel tetap + tombol back',
    ok:
      matrix.includes('showFilteredEmpty') &&
      matrix.includes('ReportingTableShell') &&
      matrix.includes('join-report-table__filter-empty-btn') &&
      matrix.includes('onColumnFilterChange(null)'),
  },
  {
    name: 'Matrix filter empty: i18n matrixFilterClear',
    ok: en.includes('matrixFilterClear') && en.includes('Back to all groups'),
  },
  {
    name: 'Reporting reload event dari provider',
    ok:
      provider.includes("new Event('rm-reporting-reload')") &&
      provider.includes('scheduleReportingReload'),
  },
  {
    name: 'refreshIssues memicu scheduleReportingReload',
    ok:
      provider.includes('scheduleReportingReload();') &&
      /refreshIssues[\s\S]*scheduleReportingReload/.test(provider),
  },
  {
    name: 'Reporting matrix: fetch langsung Supabase (bukan cache)',
    ok:
      loadReport.includes('fetchAllSupabaseRows') &&
      loadReport.includes('dedupeDailyRowsByGroupIdKeepLatest'),
  },
  {
    name: 'Panel: clear search saat matrix kosong',
    ok:
      panel.includes('onClearGroupNameSearch') &&
      panel.includes("groupNameSearch: ''"),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nReporting matrix checks passed.');
