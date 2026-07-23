import {
  DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
  HARD_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
} from '@/config/deviceConcurrencyPolicy';
import type { Platform } from '@/types/database';

export const AUTO_SCRAPE_BRAND_TOGGLES_KEY = 'rm_auto_scrape_brand_toggles';
export const AUTO_SCRAPE_BRAND_ACCOUNTS_KEY = 'rm_auto_scrape_brand_accounts';
export const AUTO_SCRAPE_BRAND_STATUS_KEY = 'rm_auto_scrape_brand_status';

export type AutoScrapeBrandToggleMap = Record<string, boolean>;

/** `all` = semua akun brand; string[] = pilihan custom (satu atau banyak). */
export type AutoScrapeBrandAccountSelection = 'all' | string[];
export type AutoScrapeBrandAccountMap = Record<string, AutoScrapeBrandAccountSelection>;

/**
 * Hasil per akun:
 * - success = auto scrape selesai
 * - failed = dijalankan tapi gagal
 * - session_invalid = tidak dijalankan (skip / session tidak valid) — bukan gagal scrape
 */
export type AutoScrapeAccountOutcome = 'success' | 'failed' | 'session_invalid';

export type AutoScrapeBrandAccountResultRow = {
  accountId: string;
  accountName: string;
  outcome: AutoScrapeAccountOutcome;
  error?: string;
};

export type AutoScrapeBrandStatusEntry = {
  /** Semua akun Acc = success (tidak ada failed / session_invalid). */
  allSuccessful: boolean;
  successCount: number;
  totalCount: number;
  updatedAt: string;
  accounts: AutoScrapeBrandAccountResultRow[];
};

export type AutoScrapeBrandStatusMap = Record<string, AutoScrapeBrandStatusEntry>;

export function autoScrapeBrandToggleKey(platform: Platform, brandName: string): string {
  return `${platform}:${brandName.trim().toLowerCase()}`;
}

export function getMaxAutoScrapeBrandSlotsPerPlatform(): number {
  return Math.min(
    DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
    HARD_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
  );
}

export function readAutoScrapeBrandToggles(): AutoScrapeBrandToggleMap {
  try {
    const raw = localStorage.getItem(AUTO_SCRAPE_BRAND_TOGGLES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: AutoScrapeBrandToggleMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function persistAutoScrapeBrandToggles(map: AutoScrapeBrandToggleMap): void {
  localStorage.setItem(AUTO_SCRAPE_BRAND_TOGGLES_KEY, JSON.stringify(map));
}

export function readAutoScrapeBrandAccounts(): AutoScrapeBrandAccountMap {
  try {
    const raw = localStorage.getItem(AUTO_SCRAPE_BRAND_ACCOUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: AutoScrapeBrandAccountMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === 'all') {
        out[key] = 'all';
        continue;
      }
      if (Array.isArray(value) && value.every((id) => typeof id === 'string')) {
        out[key] = value as string[];
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function persistAutoScrapeBrandAccounts(map: AutoScrapeBrandAccountMap): void {
  localStorage.setItem(AUTO_SCRAPE_BRAND_ACCOUNTS_KEY, JSON.stringify(map));
}

export function isAutoScrapeBrandEnabled(
  platform: Platform,
  brandName: string,
  map: AutoScrapeBrandToggleMap = readAutoScrapeBrandToggles(),
): boolean {
  return map[autoScrapeBrandToggleKey(platform, brandName)] === true;
}

export function getAutoScrapeBrandAccountSelection(
  platform: Platform,
  brandName: string,
  map: AutoScrapeBrandAccountMap = readAutoScrapeBrandAccounts(),
): AutoScrapeBrandAccountSelection {
  return map[autoScrapeBrandToggleKey(platform, brandName)] ?? 'all';
}

export function countEnabledAutoScrapeBrandsForPlatform(
  platform: Platform,
  map: AutoScrapeBrandToggleMap = readAutoScrapeBrandToggles(),
): number {
  const prefix = `${platform}:`;
  let n = 0;
  for (const [key, on] of Object.entries(map)) {
    if (on && key.startsWith(prefix)) n += 1;
  }
  return n;
}

/**
 * Set toggle brand. Jika ON dan kuota platform sudah penuh → gagal (slots_full).
 * Saat ON: Acc default `all`. Saat OFF: Acc di-reset ke `all`.
 */
export function setAutoScrapeBrandEnabled(
  platform: Platform,
  brandName: string,
  enabled: boolean,
  map: AutoScrapeBrandToggleMap = readAutoScrapeBrandToggles(),
  accountMap: AutoScrapeBrandAccountMap = readAutoScrapeBrandAccounts(),
):
  | {
      ok: true;
      map: AutoScrapeBrandToggleMap;
      accountMap: AutoScrapeBrandAccountMap;
    }
  | {
      ok: false;
      reason: 'slots_full';
      map: AutoScrapeBrandToggleMap;
      accountMap: AutoScrapeBrandAccountMap;
    } {
  const key = autoScrapeBrandToggleKey(platform, brandName);
  const next = { ...map };
  const nextAccounts = { ...accountMap };

  if (!enabled) {
    next[key] = false;
    nextAccounts[key] = 'all';
    persistAutoScrapeBrandToggles(next);
    persistAutoScrapeBrandAccounts(nextAccounts);
    return { ok: true, map: next, accountMap: nextAccounts };
  }

  if (next[key] === true) {
    if (nextAccounts[key] == null) {
      nextAccounts[key] = 'all';
      persistAutoScrapeBrandAccounts(nextAccounts);
    }
    return { ok: true, map: next, accountMap: nextAccounts };
  }

  const max = getMaxAutoScrapeBrandSlotsPerPlatform();
  if (countEnabledAutoScrapeBrandsForPlatform(platform, next) >= max) {
    return { ok: false, reason: 'slots_full', map, accountMap };
  }

  next[key] = true;
  nextAccounts[key] = 'all';
  persistAutoScrapeBrandToggles(next);
  persistAutoScrapeBrandAccounts(nextAccounts);
  return { ok: true, map: next, accountMap: nextAccounts };
}

export function setAutoScrapeBrandAccounts(
  platform: Platform,
  brandName: string,
  selection: AutoScrapeBrandAccountSelection,
  map: AutoScrapeBrandAccountMap = readAutoScrapeBrandAccounts(),
): AutoScrapeBrandAccountMap {
  const key = autoScrapeBrandToggleKey(platform, brandName);
  const next = { ...map, [key]: selection };
  persistAutoScrapeBrandAccounts(next);
  return next;
}

/** Filter akun brand menurut pilihan Acc (all = semua). */
export function filterAccountsByAutoScrapeSelection<T extends { id: string }>(
  accounts: T[],
  selection: AutoScrapeBrandAccountSelection,
): T[] {
  if (selection === 'all') return accounts;
  if (selection.length === 0) return [];
  const allowed = new Set(selection);
  return accounts.filter((row) => allowed.has(row.id));
}

function parseAccountOutcome(value: unknown): AutoScrapeAccountOutcome | null {
  if (value === 'success' || value === 'failed' || value === 'session_invalid') return value;
  // Legacy labels from earlier draft
  if (value === 'skipped') return 'session_invalid';
  return null;
}

export function readAutoScrapeBrandStatus(): AutoScrapeBrandStatusMap {
  try {
    const raw = localStorage.getItem(AUTO_SCRAPE_BRAND_STATUS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: AutoScrapeBrandStatusMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      if (!Array.isArray(row.accounts)) continue;
      if (typeof row.updatedAt !== 'string') continue;

      const accounts: AutoScrapeBrandAccountResultRow[] = [];
      for (const item of row.accounts) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const acc = item as Record<string, unknown>;
        if (typeof acc.accountId !== 'string' || typeof acc.accountName !== 'string') continue;
        const outcome =
          parseAccountOutcome(acc.outcome) ?? parseAccountOutcome(acc.result);
        if (!outcome) continue;
        accounts.push({
          accountId: acc.accountId,
          accountName: acc.accountName,
          outcome,
          error: typeof acc.error === 'string' ? acc.error : undefined,
        });
      }
      if (accounts.length === 0) continue;

      const successCount =
        typeof row.successCount === 'number'
          ? row.successCount
          : accounts.filter((a) => a.outcome === 'success').length;
      const totalCount =
        typeof row.totalCount === 'number' ? row.totalCount : accounts.length;
      const allSuccessful =
        typeof row.allSuccessful === 'boolean'
          ? row.allSuccessful
          : successCount === totalCount && totalCount > 0;

      out[key] = {
        allSuccessful,
        successCount,
        totalCount,
        updatedAt: row.updatedAt,
        accounts,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function persistAutoScrapeBrandStatus(map: AutoScrapeBrandStatusMap): void {
  localStorage.setItem(AUTO_SCRAPE_BRAND_STATUS_KEY, JSON.stringify(map));
}

export function getAutoScrapeBrandRunStatus(
  platform: Platform,
  brandName: string,
  map: AutoScrapeBrandStatusMap = readAutoScrapeBrandStatus(),
): AutoScrapeBrandStatusEntry | null {
  return map[autoScrapeBrandToggleKey(platform, brandName)] ?? null;
}

export function setAutoScrapeBrandAccountResults(
  platform: Platform,
  brandName: string,
  accounts: AutoScrapeBrandAccountResultRow[],
  map: AutoScrapeBrandStatusMap = readAutoScrapeBrandStatus(),
): AutoScrapeBrandStatusMap {
  if (accounts.length === 0) return map;

  const successCount = accounts.filter((row) => row.outcome === 'success').length;
  const totalCount = accounts.length;
  const allSuccessful = successCount === totalCount && totalCount > 0;

  const key = autoScrapeBrandToggleKey(platform, brandName);
  const next: AutoScrapeBrandStatusMap = {
    ...map,
    [key]: {
      allSuccessful,
      successCount,
      totalCount,
      updatedAt: new Date().toISOString(),
      accounts,
    },
  };
  persistAutoScrapeBrandStatus(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('rm-auto-scrape-brand-status'));
  }
  return next;
}
