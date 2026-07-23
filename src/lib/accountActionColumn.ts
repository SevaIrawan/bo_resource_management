import { computeAccountGapMetrics } from '@/lib/accountGapMetrics';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

export type AccountActionProcessIntent = 'sync' | 'scraper';

export type AccountActionColumnKind =
  | 'none'
  | 'aligned'
  | 'not-aligned'
  | 'cancel-scrape'
  | 'proc-sync';

/**
 * Ada data scrape + master untuk menilai alignment Remark.
 * (Legacy name retained for audit / callers.)
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
 * Kolom Remark — prioritas:
 * Cancel scrape → Proc Sync → Not Aligned (ada Junk/Missing/Not admin) → Aligned (clean) → kosong.
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
  if (!accountHasGroupLinkData(row)) {
    return 'none';
  }
  const gaps = computeAccountGapMetrics(row);
  if (gaps.isClean) {
    return 'aligned';
  }
  return 'not-aligned';
}
