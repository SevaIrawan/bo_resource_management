import type { AccountSyncResult } from '@/lib/accountBrandUtils';

/**
 * Not aligned / Issue KPI / ticket reconcile — hanya Groups Y/X dan Admin.
 * Session (valid/logout) TIDAK masuk sini; badge session terpisah (`platform_sessions`).
 */
export function isRowMisaligned(result: AccountSyncResult): boolean {
  return (
    result.groupsCurrent !== result.groupsTotal ||
    result.adminCurrent !== result.adminTotal
  );
}

/**
 * Popup resume-empty (OK saja) — hanya bila ada **bukti** semua sumber = 0.
 *
 * Sync valid (GM) = probe session saja, **tidak** baca jumlah grup di HP.
 * Tanpa daily hari ini → tidak boleh resume-empty (grup di device belum diverifikasi).
 *
 * Now/Later jika: daily hari ini ada, atau Y/X grid > 0, atau master brand X > 0,
 * atau belum ada daily (user boleh scrape untuk baca device).
 */
export function shouldShowResumeOnlyEmpty(input: {
  result: AccountSyncResult;
  deviceGroupCount: number;
  hasDailyToday: boolean;
}): boolean {
  if (!input.hasDailyToday) return false;
  if (input.deviceGroupCount > 0) return false;
  if (input.result.groupsCurrent > 0) return false;
  if (input.result.groupsTotal > 0) return false;
  return true;
}

export type PostSyncModalStep = 'scrape-prompt' | 'resume-empty';

export function postSyncModalStep(input: {
  result: AccountSyncResult;
  deviceGroupCount: number;
  hasDailyToday: boolean;
}): PostSyncModalStep {
  return shouldShowResumeOnlyEmpty(input) ? 'resume-empty' : 'scrape-prompt';
}
