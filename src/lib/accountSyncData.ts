import { DAILY_PHONE_SELECT } from '@/config/dbColumns';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import { computeIsMisaligned } from '@/lib/accountDisplayMetrics';
import { fetchDailyGroupCount } from '@/lib/accountScrapeData';
import { PHONE_COLUMN_MIGRATION_HINT } from '@/lib/dbPhoneSchema';
import { hasValidAccountPhone } from '@/lib/accountPhone';
import { countBrandMasterGroups } from '@/lib/brandStandardCount';
import { phonesMatch } from '@/lib/phoneNormalize';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export interface MasterGroupStats {
  /** X — total grup valid di master brand+platform */
  brandMasterTotal: number;
  /** Grup master yang ada di daily akun ini */
  joinedInMaster: number;
  /** Dari joined, berapa is_admin = yes */
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

/** Bandingkan daily akun vs master brand (join by group_id). */
export async function fetchMasterGroupStatsForAccount(input: {
  accountId: string;
  brand: string;
  platform: Platform;
}): Promise<MasterGroupStats> {
  const dbId = normalizeDbAccountId(input.accountId);
  const brand = input.brand.trim();
  const empty = { brandMasterTotal: 0, joinedInMaster: 0, adminInMaster: 0 };
  if (!dbId) return empty;

  const supabase = getSupabase();
  if (!supabase) return empty;

  const brandMasterTotal = await countBrandMasterGroups(brand, input.platform);
  if (brandMasterTotal <= 0) return { ...empty, brandMasterTotal: 0 };

  const { data: masterRows, error: masterError } = await supabase
    .from(TABLES.groupsMaster)
    .select('group_id')
    .eq('brand', brand)
    .eq('platform', input.platform);

  if (masterError) {
    throwIfSchemaError(masterError);
    throw masterError;
  }

  const masterGids = new Set(
    (masterRows ?? []).map((r) => String(r.group_id ?? '').trim()).filter(Boolean),
  );
  if (!masterGids.size) {
    return { brandMasterTotal, joinedInMaster: 0, adminInMaster: 0 };
  }

  const { data: dailyRows, error: dailyError } = await supabase
    .from(TABLES.groupScrapeDaily)
    .select('group_id, is_admin')
    .eq('account_id', dbId);

  if (dailyError) {
    throwIfSchemaError(dailyError);
    throw dailyError;
  }

  let joinedInMaster = 0;
  let adminInMaster = 0;
  for (const row of dailyRows ?? []) {
    const gid = String(row.group_id ?? '').trim();
    if (!masterGids.has(gid)) continue;
    joinedInMaster += 1;
    if (row.is_admin === 'yes') adminInMaster += 1;
  }

  return { brandMasterTotal, joinedInMaster, adminInMaster };
}

/**
 * Metrik UI setelah scrape — dari daily + master DB (bukan hitung ulang di device).
 * Groups Y = baris daily akun; Admin = admin di grup standar brand (join group_id) / X.
 */
export async function buildMetricsFromScrapeDaily(input: {
  accountId: string;
  brand: string;
  platform: Platform;
  brandStandard?: number;
  sessionValid?: boolean;
  /** Jumlah grup dari hasil scrape (sama dengan baris daily yang di-insert). */
  deviceGroupCount?: number;
  /** Admin di device (grup scrape is_admin=yes). */
  deviceAdminCount?: number;
}): Promise<{ result: AccountSyncResult; master: MasterGroupStats }> {
  const master = await fetchMasterGroupStatsForAccount({
    accountId: input.accountId,
    brand: input.brand,
    platform: input.platform,
  });

  const dbId = normalizeDbAccountId(input.accountId);
  const dailyCount =
    input.deviceGroupCount ??
    (dbId ? await fetchDailyGroupCount(input.brand, '', '', dbId) : 0);

  const brandX =
    input.brandStandard != null ? Math.max(0, input.brandStandard) : master.brandMasterTotal;

  const sessionValid = input.sessionValid !== false;
  const adminY =
    input.deviceAdminCount != null && input.deviceAdminCount >= 0
      ? input.deviceAdminCount
      : master.adminInMaster;

  return {
    master,
    result: {
      groupsCurrent: dailyCount,
      groupsTotal: brandX,
      adminCurrent: adminY,
      adminTotal: brandX,
      sessionStatus: sessionValid ? 'valid' : 'invalid',
    },
  };
}

export async function fetchMasterGroupStatsBatch(
  accounts: { id: string; brandName: string; platform: Platform }[],
): Promise<Map<string, MasterGroupStats>> {
  const map = new Map<string, MasterGroupStats>();

  await Promise.all(
    accounts.map(async (acc) => {
      const key = normalizeDbAccountId(acc.id) ?? acc.id;
      const stats = await fetchMasterGroupStatsForAccount({
        accountId: acc.id,
        brand: acc.brandName,
        platform: acc.platform,
      });
      map.set(key, stats);
    }),
  );

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
  const brandX = Math.max(0, options?.brandStandard ?? master.brandMasterTotal);
  const groupsCurrent = row.groupsCurrent;
  const adminCurrent =
    row.adminCurrent > 0 ? row.adminCurrent : master.adminInMaster;
  return {
    ...row,
    groupsCurrent,
    groupsTotal: brandX,
    adminCurrent,
    adminTotal: brandX,
    syncState: row.syncState === 'pending' ? 'synced' : row.syncState,
    isMisaligned: computeIsMisaligned({
      groupsCurrent,
      groupsTotal: brandX,
      adminCurrent,
      adminTotal: brandX,
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

/** @deprecated Gunakan fetchMasterGroupStatsForAccount dengan brand+platform */
export async function fetchMasterGroupStats(
  brand: string,
  _accName: string,
  _phone: string,
  platform: Platform,
  accountId?: string,
): Promise<MasterGroupStats> {
  if (accountId) {
    return fetchMasterGroupStatsForAccount({ accountId, brand, platform });
  }
  const brandMasterTotal = await countBrandMasterGroups(brand.trim(), platform);
  return { brandMasterTotal, joinedInMaster: 0, adminInMaster: 0 };
}
