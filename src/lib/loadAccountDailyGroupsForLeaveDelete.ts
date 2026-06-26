import {
  computeAccountTicketBreakdown,
} from '@/lib/accountMasterDailyCompare';
import { dedupeDailyRowsByGroupIdKeepLatest } from '@/lib/dedupeScrapeDaily';
import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import type { Platform } from '@/types/database';

export interface AccountDailyGroupForLeaveDelete {
  groupId: string;
  groupName: string;
  inviteLink: string | null;
}

export interface AccountExitGroupsSnapshot {
  /** Semua grup real di akun (group_scrape_daily, brand+platform, scrape terbaru per group_id). */
  daily: AccountDailyGroupForLeaveDelete[];
  /** Grup di daily yang tidak ada di master — selisih daily minus master (junk). */
  junk: AccountDailyGroupForLeaveDelete[];
}

type DailyGroupRow = {
  group_id: string;
  group_name: string | null;
  invite_link: string | null;
  brand: string;
  platform: Platform;
  scraped_at?: string | null;
};

function mapDailyRow(row: {
  group_id: string;
  group_name?: string | null;
  invite_link?: string | null;
}): AccountDailyGroupForLeaveDelete | null {
  const groupId = String(row.group_id ?? '').trim();
  if (!groupId) return null;
  return {
    groupId,
    groupName: String(row.group_name ?? '').trim() || groupId,
    inviteLink: row.invite_link?.trim() || null,
  };
}

/**
 * Grup pada akun dari daily scrape: tab Daily = semua daily; tab Junk = daily tidak di master.
 */
export async function loadAccountExitGroupsSnapshot(input: {
  accountId: string;
  brandName: string;
  platform: Platform;
}): Promise<AccountExitGroupsSnapshot> {
  const brand = input.brandName.trim();
  if (!brand || !input.accountId.trim()) {
    return { daily: [], junk: [] };
  }

  const [masterRows, dailyRaw] = await Promise.all([
    fetchAllSupabaseRows<{ group_id: string; group_name: string; invite_link: string }>(
      TABLES.groupsMaster,
      'group_id, group_name, invite_link',
      [
        { column: 'brand', value: brand },
        { column: 'platform', value: input.platform },
      ],
    ),
    fetchAllSupabaseRows<DailyGroupRow>(
      TABLES.groupScrapeDaily,
      'group_id, group_name, invite_link, brand, platform, scraped_at',
      [{ column: 'account_id', value: input.accountId }],
    ),
  ]);

  const dailyBrandPlatform = dedupeDailyRowsByGroupIdKeepLatest(
    dailyRaw.filter(
      (row) => String(row.brand ?? '').trim() === brand && row.platform === input.platform,
    ),
  );

  const breakdown = computeAccountTicketBreakdown(masterRows, dailyBrandPlatform);

  const daily: AccountDailyGroupForLeaveDelete[] = [];
  for (const row of dailyBrandPlatform) {
    const mapped = mapDailyRow(row);
    if (mapped) daily.push(mapped);
  }

  const junk: AccountDailyGroupForLeaveDelete[] = [];
  for (const row of breakdown.junk) {
    const mapped = mapDailyRow({
      group_id: row.groupId,
      group_name: row.groupName,
      invite_link: row.groupLink,
    });
    if (mapped) junk.push(mapped);
  }

  daily.sort((a, b) => a.groupName.localeCompare(b.groupName));
  junk.sort((a, b) => a.groupName.localeCompare(b.groupName));

  return { daily, junk };
}

/** @deprecated use loadAccountExitGroupsSnapshot */
export async function loadAccountDailyGroupsForLeaveDelete(input: {
  accountId: string;
  brandName: string;
  platform: Platform;
}): Promise<AccountDailyGroupForLeaveDelete[]> {
  const snapshot = await loadAccountExitGroupsSnapshot(input);
  return snapshot.daily;
}
