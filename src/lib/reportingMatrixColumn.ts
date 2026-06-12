import type { JoinGroupMatrixRow } from '@/lib/loadJoinGroupReport';

export type ReportingMatrixColumnFilterValue = 'yes' | 'no';

/** Satu kolom akun aktif — filter baris berdasarkan Yes/No di kolom itu. */
export type ReportingMatrixColumnFilter = {
  accountId: string;
  value: ReportingMatrixColumnFilterValue;
} | null;

function rowValue(
  row: JoinGroupMatrixRow,
  accountId: string,
  mode: 'join' | 'admin',
): boolean {
  return mode === 'admin' ? row.adminByAccountId[accountId] : row.joinByAccountId[accountId];
}

/** Filter baris: kolom terpilih Yes/No; kolom akun lain tetap tampil untuk baris yang lolos. */
export function filterReportingMatrixRows(
  rows: JoinGroupMatrixRow[],
  filter: ReportingMatrixColumnFilter,
  mode: 'join' | 'admin',
): JoinGroupMatrixRow[] {
  if (!filter) return rows;

  return rows.filter((row) => {
    const yes = rowValue(row, filter.accountId, mode);
    return filter.value === 'yes' ? yes : !yes;
  });
}
