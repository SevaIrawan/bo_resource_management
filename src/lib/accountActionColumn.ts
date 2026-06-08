import type { AccountBrandRow } from '@/types/accountMonitoringUi';

export type AccountActionProcessIntent = 'sync' | 'scraper';

export type AccountActionColumnKind =
  | 'none'
  | 'group-link'
  | 'cancel-run'
  | 'proc-sync'
  | 'proc-scraper';

/**
 * Group link hanya bila >0/>0 (Y scrape + X master dari pipeline).
 * Selain itu — termasuk kiamat / di luar nalar — caller fallback ke kosong.
 */
export function accountHasGroupLinkData(row: {
  groupsCurrent: number;
  groupsTotal: number;
}): boolean {
  const y = row.groupsCurrent;
  const x = row.groupsTotal;
  if (!Number.isFinite(y) || !Number.isFinite(x)) return false;
  return y > 0 && x > 0;
}

/**
 * Kolom Action — prioritas:
 * Cancel Run → Proc Sync/Scraper → Group link (hanya >0/>0) → kosong (fallback).
 */
export function resolveAccountActionColumn(
  row: AccountBrandRow,
  activeProcessIntent: AccountActionProcessIntent | null = null,
): AccountActionColumnKind {
  if (row.actionProcess === 'scraper') {
    return 'cancel-run';
  }
  if (row.actionProcess === 'sync') {
    return 'proc-sync';
  }
  if (row.actionProcess === 'session_check') {
    return activeProcessIntent === 'scraper' ? 'proc-scraper' : 'proc-sync';
  }
  if (accountHasGroupLinkData(row)) {
    return 'group-link';
  }
  return 'none';
}
