import { dedupeDailyRowsByGroupIdKeepLatest } from '@/lib/dedupeScrapeDaily';
import type { CompareDailyRow, CompareMasterRow } from '@/lib/accountMasterDailyCompare';
import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows, SUPABASE_FETCH_PAGE_SIZE } from '@/lib/supabasePagedSelect';
import { getSupabase } from '@/lib/supabase';
import type { Platform } from '@/types/database';

type DailyRowRaw = CompareDailyRow & { scraped_at?: string | null; account_id?: string };

export function brandPlatformCacheKey(brand: string, platform: Platform): string {
  return `${brand.trim()}|${platform}`;
}

const masterByBrandPlatform = new Map<string, CompareMasterRow[]>();
const dailyByAccountId = new Map<string, CompareDailyRow[]>();

export function clearMasterDailyLoadCache(): void {
  masterByBrandPlatform.clear();
  dailyByAccountId.clear();
}

/** Setelah scrape/sync tulis daily + rebuild master — cache lama bikin UI/ticket stuck. */
export function invalidateMasterDailyCacheForScrape(input: {
  accountId: string;
  brand: string;
  platform: Platform;
}): void {
  dailyByAccountId.delete(input.accountId);
  masterByBrandPlatform.delete(brandPlatformCacheKey(input.brand.trim(), input.platform));
}

/** Setelah fetch DB — isi cache dengan snapshot terbaru (ticket/reporting/grid). */
export function setCachedMasterDailyForAccount(input: {
  accountId: string;
  brand: string;
  platform: Platform;
  masterRows: CompareMasterRow[];
  dailyRows: CompareDailyRow[];
}): void {
  masterByBrandPlatform.set(
    brandPlatformCacheKey(input.brand.trim(), input.platform),
    input.masterRows,
  );
  dailyByAccountId.set(input.accountId, input.dailyRows);
}

export function getCachedMasterRows(
  brand: string,
  platform: Platform,
): CompareMasterRow[] | undefined {
  return masterByBrandPlatform.get(brandPlatformCacheKey(brand, platform));
}

export function getCachedDailyRows(accountId: string): CompareDailyRow[] | undefined {
  return dailyByAccountId.get(accountId);
}

export function countCachedMasterDistinct(brand: string, platform: Platform): number | null {
  const rows = getCachedMasterRows(brand, platform);
  if (!rows) return null;
  const gids = new Set<string>();
  for (const row of rows) {
    const gid = String(row.group_id ?? '').trim();
    if (gid) gids.add(gid);
  }
  return gids.size;
}

/** Satu fetch master per brand+platform + satu batch daily semua akun — dipakai ulang grid & ticket. */
export async function warmMasterDailyLoadCache(
  accounts: { id: string; brandName: string; platform: Platform }[],
): Promise<void> {
  clearMasterDailyLoadCache();
  if (accounts.length === 0) return;

  const brandPlatformPairs = new Map<string, { brand: string; platform: Platform }>();
  const accountIds: string[] = [];

  for (const account of accounts) {
    const brand = account.brandName.trim();
    if (!brand) continue;
    const bp = brandPlatformCacheKey(brand, account.platform);
    if (!brandPlatformPairs.has(bp)) {
      brandPlatformPairs.set(bp, { brand, platform: account.platform });
    }
    if (!accountIds.includes(account.id)) accountIds.push(account.id);
  }

  const masterFetches = [...brandPlatformPairs.values()].map(async ({ brand, platform }) => {
    const rows = await fetchAllSupabaseRows<CompareMasterRow>(
      TABLES.groupsMaster,
      'group_id, group_name, invite_link',
      [
        { column: 'brand', value: brand },
        { column: 'platform', value: platform },
      ],
    );
    masterByBrandPlatform.set(brandPlatformCacheKey(brand, platform), rows);
  });

  await Promise.all([...masterFetches, partitionDailyBatch(accountIds)]);
}

const DAILY_IN_CHUNK = 40;

async function fetchDailyRowsForAccounts(accountIds: string[]): Promise<DailyRowRaw[]> {
  const supabase = getSupabase();
  if (!supabase || accountIds.length === 0) return [];

  const rows: DailyRowRaw[] = [];
  for (let i = 0; i < accountIds.length; i += DAILY_IN_CHUNK) {
    const chunk = accountIds.slice(i, i + DAILY_IN_CHUNK);
    let from = 0;
    for (;;) {
      const to = from + SUPABASE_FETCH_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from(TABLES.groupScrapeDaily)
        .select('account_id, group_id, group_name, invite_link, is_admin, scraped_at')
        .in('account_id', chunk)
        .order('account_id', { ascending: true })
        .order('group_id', { ascending: true })
        .order('scrape_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      if (error) throw error;
      const page = (data ?? []) as DailyRowRaw[];
      rows.push(...page);
      if (page.length < SUPABASE_FETCH_PAGE_SIZE) break;
      from += SUPABASE_FETCH_PAGE_SIZE;
    }
  }
  return rows;
}

async function partitionDailyBatch(accountIds: string[]): Promise<void> {
  const data = await fetchDailyRowsForAccounts(accountIds);

  const rawByAccount = new Map<string, DailyRowRaw[]>();
  for (const row of data) {
    const accountId = String(row.account_id ?? '').trim();
    if (!accountId) continue;
    const list = rawByAccount.get(accountId) ?? [];
    list.push({
      account_id: accountId,
      group_id: row.group_id,
      group_name: row.group_name,
      invite_link: row.invite_link,
      is_admin: row.is_admin,
      scraped_at: row.scraped_at,
    });
    rawByAccount.set(accountId, list);
  }

  for (const accountId of accountIds) {
    const raw = rawByAccount.get(accountId) ?? [];
    dailyByAccountId.set(accountId, dedupeDailyRowsByGroupIdKeepLatest(raw));
  }
}
