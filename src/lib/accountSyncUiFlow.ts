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
 * Legacy helper — tidak dipakai `postSyncModalStep` (selalu Now|Later).
 * Tetap ada untuk audit/tes historis; jangan pakai untuk routing Sync baru.
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

/**
 * Setelah Check Session device Valid → selalu Scrape Now | Later (kontrak Session UI).
 * `resume-empty` tidak dipakai.
 */
export function postSyncModalStep(_input: {
  result: AccountSyncResult;
  deviceGroupCount: number;
  hasDailyToday: boolean;
}): PostSyncModalStep {
  void _input;
  return 'scrape-prompt';
}
