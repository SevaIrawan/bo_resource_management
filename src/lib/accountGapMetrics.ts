import { computeAccountTicketBreakdown } from '@/lib/accountMasterDailyCompare';
import { getCachedDailyRows, getCachedMasterRows } from '@/lib/masterDailyLoadCache';
import { accountSeesOnlyBatch, groupVisibleInBatch, waBatchToken } from '@/lib/waAccountBatch';

export type AccountGapMetricsInput = {
  id?: string;
  brandName?: string;
  platform?: string;
  waBatch?: string | null;
  groupsCurrent: number;
  groupsTotal: number;
  joinedInMaster: number;
  adminCurrent: number;
  /** New Acc: Missing hanya grup di batch akun. Kosong = Old Acc / Telegram. */
  batchMissing?: number;
  /** New Acc: Not admin hanya grup di batch akun. */
  batchNotAdmin?: number;
};

export type AccountGapMetrics = {
  junk: number;
  missing: number;
  notAdmin: number;
  /** Semua gap 0 → Remark Aligned. */
  isClean: boolean;
};

/** New Acc: hitung ulang dari master cache supaya kolom sama dengan modal batch. */
function liveLetterBatchGap(
  row: AccountGapMetricsInput,
): { batchMissing: number; batchNotAdmin: number } | null {
  const onlyBatch = accountSeesOnlyBatch(row.platform ?? '', row.waBatch);
  const brand = row.brandName?.trim() ?? '';
  if (!onlyBatch || !brand) return null;
  const cached = getCachedMasterRows(brand, 'whatsapp');
  if (!cached?.length || !cached.some((item) => waBatchToken(item.batch))) return null;
  const master = cached.filter((item) => groupVisibleInBatch(item.batch, onlyBatch));
  const breakdown = computeAccountTicketBreakdown(
    master,
    row.id ? (getCachedDailyRows(row.id) ?? []) : [],
  );
  return {
    batchMissing: breakdown.missing.length,
    batchNotAdmin: breakdown.notAdmin.length,
  };
}

export function computeAccountGapMetrics(row: AccountGapMetricsInput): AccountGapMetrics {
  const junk = Math.max(0, row.groupsCurrent - row.joinedInMaster);
  const live = liveLetterBatchGap(row);
  const missing =
    live?.batchMissing ??
    row.batchMissing ??
    Math.max(0, row.groupsTotal - row.joinedInMaster);
  const notAdmin =
    live?.batchNotAdmin ??
    row.batchNotAdmin ??
    Math.max(0, row.joinedInMaster - row.adminCurrent);
  return {
    junk,
    missing,
    notAdmin,
    isClean: junk === 0 && missing === 0 && notAdmin === 0,
  };
}
