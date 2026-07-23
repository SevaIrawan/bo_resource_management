import type { GroupStockBucket } from '@/types/groupStock';

export type ReportingStockStatusFilter = GroupStockBucket | 'all';

export function filterReportingRowsByStockStatus<
  T extends { stockStatus?: GroupStockBucket },
>(rows: T[], status: ReportingStockStatusFilter): T[] {
  if (status === 'all') return rows;
  return rows.filter((row) => (row.stockStatus ?? 'review') === status);
}
