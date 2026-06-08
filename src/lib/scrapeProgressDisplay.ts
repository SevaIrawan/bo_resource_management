import { accountGroupEstimate } from '@/config/syncScraperPolicy';
import type { UiScrapeProgress } from '@/types/scrapeProgress';

export interface ScrapeBarDisplay {
  current: number;
  total: number;
  label: string;
  percent: number;
}

export function scrapeProgressEstimateTotal(metrics: {
  groupsCurrent?: number | null;
  groupsTotal?: number | null;
}): number {
  return accountGroupEstimate(metrics);
}

/** logic_sync_scraper.txt baris 16 — RUNNING: bar + X/Y + marquee. */
export function resolveScrapeBarDisplay(
  metrics: { groupsCurrent?: number | null; groupsTotal?: number | null },
  progress: UiScrapeProgress | null | undefined,
  fallbackLabel: string,
): ScrapeBarDisplay {
  const estimate = scrapeProgressEstimateTotal(metrics);

  if (!progress) {
    return { current: 0, total: estimate, label: fallbackLabel, percent: 0 };
  }

  const label = progress.label?.trim() || fallbackLabel;

  if (progress.phase === 'group' && progress.total > 0) {
    const current = progress.current;
    const total = progress.total;
    const percent = Math.min(100, Math.round((current / total) * 100));
    return { current, total, label, percent };
  }

  if (progress.phase === 'discover' && progress.total > 0) {
    return { current: 0, total: progress.total, label, percent: 0 };
  }

  if (progress.phase === 'done' && progress.total > 0) {
    const percent = Math.min(100, Math.round((progress.current / progress.total) * 100));
    return {
      current: progress.current,
      total: progress.total,
      label,
      percent,
    };
  }

  return { current: 0, total: estimate, label, percent: 0 };
}

export function bootScrapeProgress(
  account: { platform: 'whatsapp' | 'telegram'; groupsCurrent?: number; groupsTotal?: number },
  t: (key: string) => string,
): UiScrapeProgress {
  const total = scrapeProgressEstimateTotal(account);
  const labelKey =
    account.platform === 'whatsapp'
      ? 'groupMonitoring.accountCard.scraperBootWa'
      : 'groupMonitoring.accountCard.scraperBootTg';

  return {
    phase: 'connect',
    current: 0,
    total,
    label: t(labelKey),
    percent: 0,
  };
}
