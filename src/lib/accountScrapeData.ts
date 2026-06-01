import { countDistinctDailyGroupsForAccount } from '@/lib/dedupeScrapeDaily';
import { countBrandMasterGroups } from '@/lib/brandStandardCount';
import { TABLES } from '@/config/tables';
import { hasValidAccountPhone } from '@/lib/accountPhone';
import { phonesMatch } from '@/lib/phoneNormalize';
import { getSupabase } from '@/lib/supabase';
import type { Platform } from '@/types/database';

export interface AccountSyncSnapshot {
  groupsCurrent: number;
  groupsTotal: number;
  adminCurrent: number;
  adminTotal: number;
  dailyCount: number;
  masterCount: number;
  scrapeDate: string | null;
}

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** X — jumlah grup valid di master brand+platform */
export async function fetchBrandMasterGroupCount(
  brand: string,
  platform: Platform,
): Promise<number> {
  return countBrandMasterGroups(brand.trim(), platform);
}

/** @deprecated Alias — master per brand, bukan per acc */
export async function fetchMasterGroupCount(
  brand: string,
  _accName: string,
  platform: Platform,
  _phoneNumber?: string,
): Promise<number> {
  void _accName;
  void _phoneNumber;
  return fetchBrandMasterGroupCount(brand, platform);
}

export async function fetchDailyGroupCount(
  brand: string,
  accName: string,
  phoneNumber?: string,
  accountId?: string,
): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  if (accountId) {
    return countDistinctDailyGroupsForAccount(accountId);
  }

  let latestQuery = supabase
    .from(TABLES.groupScrapeDaily)
    .select('scrape_date')
    .eq('brand', brand.trim())
    .eq('acc_name', accName.trim())
    .order('scrape_date', { ascending: false })
    .limit(1);

  const phone = phoneNumber?.trim();
  if (phone && hasValidAccountPhone(phone)) {
    latestQuery = latestQuery.eq('phone_number', phone);
  }

  const { data: latestRow, error: latestError } = await latestQuery.maybeSingle();

  if (latestError) throw latestError;
  if (!latestRow?.scrape_date) return 0;

  let countQuery = supabase
    .from(TABLES.groupScrapeDaily)
    .select('id', { count: 'exact', head: true })
    .eq('brand', brand.trim())
    .eq('acc_name', accName.trim())
    .eq('scrape_date', latestRow.scrape_date);

  if (phone && hasValidAccountPhone(phone)) {
    countQuery = countQuery.eq('phone_number', phone);
  }

  const { count, error } = await countQuery;
  if (error) throw error;
  return count ?? 0;
}

export async function accountHasSyncData(input: {
  brand: string;
  accName: string;
  platform: Platform;
  phoneNumber?: string;
  accountId?: string;
}): Promise<boolean> {
  const masterCount = await fetchBrandMasterGroupCount(input.brand, input.platform);
  if (masterCount > 0) return true;

  const dailyCount = await fetchDailyGroupCount(
    input.brand,
    input.accName,
    input.phoneNumber,
    input.accountId,
  );
  if (dailyCount > 0) return true;

  const supabase = getSupabase();
  if (!supabase) return false;

  const phoneDigits = normalizePhoneDigits(input.phoneNumber ?? '');
  if (phoneDigits.length >= 8) {
    const { count, error } = await supabase
      .from(TABLES.groupScrapeDaily)
      .select('id', { count: 'exact', head: true })
      .eq('brand', input.brand.trim())
      .eq('platform', input.platform);

    if (!error && (count ?? 0) > 0) {
      const { data: rows } = await supabase
        .from(TABLES.groupScrapeDaily)
        .select('phone_number')
        .eq('brand', input.brand.trim())
        .eq('platform', input.platform)
        .limit(50);

      const match = (rows ?? []).some((row) =>
        phonesMatch(String(row.phone_number ?? ''), input.phoneNumber ?? ''),
      );
      if (match) return true;
    }
  }

  return false;
}

export async function fetchAccountSyncSnapshot(
  brand: string,
  accName: string,
  platform: Platform,
  phoneNumber?: string,
  deviceGroupCount?: number,
  accountId?: string,
): Promise<AccountSyncSnapshot | null> {
  const masterCount = await fetchBrandMasterGroupCount(brand, platform);
  const dailyCount = await fetchDailyGroupCount(
    brand,
    accName,
    phoneNumber,
    accountId,
  );

  if (masterCount === 0 && dailyCount === 0 && deviceGroupCount === undefined) {
    return null;
  }

  const deviceTotal = deviceGroupCount ?? dailyCount;
  const groupsTotal = masterCount > 0 ? masterCount : Math.max(deviceTotal, dailyCount);

  return {
    groupsCurrent: deviceTotal,
    groupsTotal,
    adminCurrent: 0,
    adminTotal: groupsTotal,
    dailyCount,
    masterCount,
    scrapeDate: null,
  };
}
