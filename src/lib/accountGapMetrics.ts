/** Gap hitungan grid Account — selaras ticket missing / not_admin / junk. */

export type AccountGapMetricsInput = {
  groupsCurrent: number;
  groupsTotal: number;
  joinedInMaster: number;
  adminCurrent: number;
};

export type AccountGapMetrics = {
  junk: number;
  missing: number;
  notAdmin: number;
  /** Semua gap 0 → Remark Aligned. */
  isClean: boolean;
};

export function computeAccountGapMetrics(row: AccountGapMetricsInput): AccountGapMetrics {
  const junk = Math.max(0, row.groupsCurrent - row.joinedInMaster);
  const missing = Math.max(0, row.groupsTotal - row.joinedInMaster);
  const notAdmin = Math.max(0, row.joinedInMaster - row.adminCurrent);
  return {
    junk,
    missing,
    notAdmin,
    isClean: junk === 0 && missing === 0 && notAdmin === 0,
  };
}
