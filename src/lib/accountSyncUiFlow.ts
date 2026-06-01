import type { AccountSyncResult } from '@/lib/accountBrandUtils';

/** Y = X dan admin match — kolom Scraper tampil last update saja. */
export function isRowMisaligned(result: AccountSyncResult): boolean {
  if (result.sessionStatus !== 'valid') return true;
  return (
    result.groupsCurrent !== result.groupsTotal ||
    result.adminCurrent !== result.adminTotal
  );
}

/**
 * DB tidak punya grup akun + device 0 grup + brand X di master juga 0 → popup resume (OK saja).
 * Jika master X > 0 tetapi device 0 → tetap Scrape now / Not now.
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
