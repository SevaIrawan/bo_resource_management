import type { JoinGroupMatrixRow } from '@/lib/loadJoinGroupReport';
import { isTelegramSuperGroupId } from '@/lib/telegramGroupKind';

export type ReportingMatrixColumnFilterValue = 'yes' | 'no';

/** Satu kolom aktif — filter baris berdasarkan Yes/No di kolom itu. */
export type ReportingMatrixColumnFilter =
  | {
      kind: 'account';
      accountId: string;
      value: ReportingMatrixColumnFilterValue;
    }
  | {
      kind: 'superGroup';
      value: ReportingMatrixColumnFilterValue;
    }
  | null;

function rowAccountValue(
  row: JoinGroupMatrixRow,
  accountId: string,
  mode: 'join' | 'admin',
): boolean {
  return mode === 'admin' ? row.adminByAccountId[accountId] : row.joinByAccountId[accountId];
}

function rowSuperGroupYes(row: JoinGroupMatrixRow): boolean {
  return isTelegramSuperGroupId(row.groupId);
}

/** Filter baris: kolom terpilih Yes/No; kolom lain tetap tampil untuk baris yang lolos. */
export function filterReportingMatrixRows(
  rows: JoinGroupMatrixRow[],
  filter: ReportingMatrixColumnFilter,
  mode: 'join' | 'admin',
): JoinGroupMatrixRow[] {
  if (!filter) return rows;

  if (filter.kind === 'superGroup') {
    return rows.filter((row) => {
      const yes = rowSuperGroupYes(row);
      return filter.value === 'yes' ? yes : !yes;
    });
  }

  return rows.filter((row) => {
    const yes = rowAccountValue(row, filter.accountId, mode);
    return filter.value === 'yes' ? yes : !yes;
  });
}
