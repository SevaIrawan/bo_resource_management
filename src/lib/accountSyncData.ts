import { DAILY_PHONE_SELECT } from '@/config/dbColumns';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import { computeIsMisaligned } from '@/lib/accountDisplayMetrics';
import { fetchAccountBookmarkMetrics } from '@/lib/accountMasterDailyCompare';
import { PHONE_COLUMN_MIGRATION_HINT } from '@/lib/dbPhoneSchema';
import { hasValidAccountPhone } from '@/lib/accountPhone';
import { phonesMatch } from '@/lib/phoneNormalize';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export interface MasterGroupStats {
  /** Y — distinct group_id daily (kolom Groups current = ticket). */
  dailyTotal: number;
  /** X — distinct group_id master brand (kolom Groups total = ticket). */
  brandMasterTotal: number;
  /** Master ∩ daily by raw group_id. */
  joinedInMaster: number;
  /** Admin di grup master yang ada di daily (kolom Admin current = ticket not_admin inverse). */
  adminInMaster: number;
}

function isSchemaColumnError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('42703') ||
    lower.includes('does not exist') ||
    lower.includes('phone_number') ||
    lower.includes('invite_link') ||
    lower.includes('account_id') ||
    lower.includes('acc_name')
  );
}

function throwIfSchemaError(error: { message?: string }) {
  if (isSchemaColumnError(error.message)) {
    throw new Error(PHONE_COLUMN_MIGRATION_HINT);
  }
}

function filterRowsByPhone<T extends { phone_number?: string | null }>(
  rows: T[],
  phone: string,
): T[] {
  if (!hasValidAccountPhone(phone)) {
    return rows;
  }
  const phoneRaw = phone.trim();
  return rows.filter((row) => phonesMatch(String(row.phone_number ?? ''), phoneRaw));
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function normalizeDbAccountId(accountId: string): string | null {
  const trimmed = accountId.trim();
  if (UUID_RE.test(trimmed)) return trimmed;
  if (trimmed.startsWith('acc-')) {
    const id = trimmed.slice(4);
    return UUID_RE.test(id) ? id : null;
  }
  return null;
}

/** Metrik master↔daily — logic sama ticket reconcile (group_id raw, semua akun). */
export async function fetchMasterGroupStatsForAccount(input: {
  accountId: string;
  brand: string;
  platform: Platform;
}): Promise<MasterGroupStats> {
  const dbId = normalizeDbAccountId(input.accountId);
  const brand = input.brand.trim();
  const empty = { dailyTotal: 0, brandMasterTotal: 0, joinedInMaster: 0, adminInMaster: 0 };
  if (!dbId || !brand) return empty;

  try {
    const m = await fetchAccountBookmarkMetrics({
      accountId: dbId,
      brandName: brand,
      platform: input.platform,
    });
    return {
      dailyTotal: m.groupsCurrent,
      brandMasterTotal: m.groupsTotal,
      joinedInMaster: m.joinedInMaster,
      adminInMaster: m.adminCurrent,
    };
  } catch (error) {
    throwIfSchemaError(error as { message?: string });
    throw error;
  }
}

/**
 * Kolom Groups Y/X & Admin di card bookmark — WAJIB sama dengan ticket reconcile.
 * Sumber: fetchAccountBookmarkMetrics (group_scrape_daily + groups_master, raw group_id).
 */
export async function buildMetricsFromScrapeDaily(input: {
  accountId: string;
  brand: string;
  platform: Platform;
  /** @deprecated Diabaikan — metrik selalu dari DB breakdown (= ticket). */
  brandStandard?: number;
  sessionValid?: boolean;
  /** @deprecated Diabaikan — jangan override device; card = ticket = daily DB. */
  deviceGroupCount?: number;
  /** @deprecated Diabaikan — admin dari breakdown DB. */
  deviceAdminCount?: number;
  /** Batch load — hindari query ganda saat buka monitoring. */
  masterHint?: MasterGroupStats;
}): Promise<{ result: AccountSyncResult; master: MasterGroupStats }> {
  void input.brandStandard;
  void input.deviceGroupCount;
  void input.deviceAdminCount;

  const master =
    input.masterHint ??
    (await fetchMasterGroupStatsForAccount({
      accountId: input.accountId,
      brand: input.brand,
      platform: input.platform,
    }));

  const sessionValid = input.sessionValid !== false;
  const x = master.brandMasterTotal;

  return {
    master,
    result: {
      groupsCurrent: master.dailyTotal,
      groupsTotal: x,
      adminCurrent: master.adminInMaster,
      adminTotal: x,
      sessionStatus: sessionValid ? 'valid' : 'invalid',
    },
  };
}

const MASTER_STATS_BATCH_CONCURRENCY = 3;

export async function fetchMasterGroupStatsBatch(
  accounts: { id: string; brandName: string; platform: Platform }[],
): Promise<Map<string, MasterGroupStats>> {
  const map = new Map<string, MasterGroupStats>();

  for (let i = 0; i < accounts.length; i += MASTER_STATS_BATCH_CONCURRENCY) {
    const chunk = accounts.slice(i, i + MASTER_STATS_BATCH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (acc) => {
        const key = normalizeDbAccountId(acc.id) ?? acc.id;
        const stats = await fetchMasterGroupStatsForAccount({
          accountId: acc.id,
          brand: acc.brandName,
          platform: acc.platform,
        });
        map.set(key, stats);
      }),
    );
  }

  return map;
}

/** Hanya update X/total & misaligned — jangan sentuh session / Y device (realtime master). */
export function patchMasterTotalsOnRow(
  row: AccountBrandRow,
  master: MasterGroupStats,
  brandStandard?: number,
): AccountBrandRow {
  const brandX = Math.max(0, brandStandard ?? master.brandMasterTotal);
  return {
    ...row,
    groupsTotal: brandX,
    adminTotal: brandX,
    isMisaligned: computeIsMisaligned({
      groupsCurrent: row.groupsCurrent,
      groupsTotal: brandX,
      adminCurrent: row.adminCurrent,
      adminTotal: brandX,
    }),
  };
}

export function applyMasterStatsToAccountRow(
  row: AccountBrandRow,
  master: MasterGroupStats,
  options?: { deviceConnected?: boolean; brandStandard?: number },
): AccountBrandRow {
  void options;
  const x = master.brandMasterTotal;
  return {
    ...row,
    groupsCurrent: master.dailyTotal,
    groupsTotal: x,
    joinedInMaster: master.joinedInMaster,
    adminCurrent: master.adminInMaster,
    adminTotal: x,
    syncState: row.syncState === 'pending' ? 'synced' : row.syncState,
    isMisaligned: computeIsMisaligned({
      groupsCurrent: master.dailyTotal,
      groupsTotal: x,
      adminCurrent: master.adminInMaster,
      adminTotal: x,
    }),
  };
}

export async function fetchHasDailyData(
  brand: string,
  accName: string,
  phone: string,
  platform: Platform,
  scrapeDate: string,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from(TABLES.groupScrapeDaily)
    .select(DAILY_PHONE_SELECT)
    .eq('brand', brand.trim())
    .eq('acc_name', accName.trim())
    .eq('platform', platform)
    .eq('scrape_date', scrapeDate)
    .limit(100);

  if (error) {
    throwIfSchemaError(error);
    throw error;
  }
  if (!data?.length) return false;

  return filterRowsByPhone(data, phone).length > 0;
}
