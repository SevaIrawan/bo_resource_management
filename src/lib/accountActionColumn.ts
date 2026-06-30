import type { AccountBrandRow } from '@/types/accountMonitoringUi';

export type AccountActionProcessIntent = 'sync' | 'scraper';

export type AccountActionColumnKind =
  | 'none'
  | 'group-link'
  | 'cancel-scrape'
  | 'proc-sync';

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

/** Intent proses aktif per baris — processingByAccount (loading) + mirror actionProcess di grid. */
export function resolveActiveProcessIntent(
  row: AccountBrandRow,
  loading: { sync?: boolean; scraper?: boolean } = {},
): AccountActionProcessIntent | null {
  if (loading.sync) return 'sync';
  if (loading.scraper) return 'scraper';
  if (row.actionProcess === 'scraper' || row.actionProcess === 'sync') {
    return row.actionProcess;
  }
  return null;
}

function isActiveScraperProcess(
  row: AccountBrandRow,
  activeProcessIntent: AccountActionProcessIntent | null,
): boolean {
  if (row.actionProcess === 'scraper') return true;
  return activeProcessIntent === 'scraper';
}

/**
 * Kolom Action — prioritas:
 * Cancel scrape (scrape aktif) → Proc Sync → Group link (hanya >0/>0) → kosong (fallback).
 */
export function resolveAccountActionColumn(
  row: AccountBrandRow,
  activeProcessIntent: AccountActionProcessIntent | null = null,
): AccountActionColumnKind {
  if (isActiveScraperProcess(row, activeProcessIntent)) {
    return 'cancel-scrape';
  }
  if (row.actionProcess === 'sync') {
    return 'proc-sync';
  }
  if (row.actionProcess === 'session_check') {
    return 'proc-sync';
  }
  if (activeProcessIntent === 'sync') {
    return 'proc-sync';
  }
  if (accountHasGroupLinkData(row)) {
    return 'group-link';
  }
  return 'none';
}

