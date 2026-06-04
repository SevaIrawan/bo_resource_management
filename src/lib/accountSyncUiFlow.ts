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
 * DB tidak punya grup akun + device 0 grup + brand X di master juga 0 → popup resume (OK saja).
 * Modal [Now | Later] hanya bila ada data yang bisa di-scrape (device > 0, daily hari ini, atau brand X > 0).
 * Jika master X > 0 tetapi device 0 → tetap Scrape now / Later.
 */
export function shouldShowResumeOnlyEmpty(input: {
  result: AccountSyncResult;
  deviceGroupCount: number;
  hasDailyToday: boolean;
}): boolean {
  if (input.deviceGroupCount > 0) return false;
  if (input.hasDailyToday) return false;
  if (input.result.groupsTotal > 0) return false;
  return input.result.groupsCurrent === 0;
}

export type PostSyncModalStep = 'scrape-prompt' | 'resume-empty';

export function postSyncModalStep(input: {
  result: AccountSyncResult;
  deviceGroupCount: number;
  hasDailyToday: boolean;
}): PostSyncModalStep {
  return shouldShowResumeOnlyEmpty(input) ? 'resume-empty' : 'scrape-prompt';
}
