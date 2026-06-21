import { TABLES } from '@/config/tables';
import { dedupeDailyRowsByGroupIdKeepLatest } from '@/lib/dedupeScrapeDaily';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import type { Platform } from '@/types/database';

export interface SuperAdminGroupForSetAdmin {
  groupId: string;
  groupName: string;
  inviteLink: string | null;
}

type DailyAdminRow = {
  group_id: string;
  group_name: string;
  invite_link: string | null;
  is_admin: string;
  brand: string;
  platform: Platform;
  scraped_at?: string | null;
};

/** Grup di daily akun X dengan is_admin=yes — kandidat set_admin (super admin = akun executor). */
export async function loadSuperAdminGroupsForSetAdmin(input: {
  accountId: string;
  brandName: string;
  platform: Platform;
}): Promise<SuperAdminGroupForSetAdmin[]> {
  const brand = input.brandName.trim();
  if (!brand || !input.accountId.trim()) return [];

  const daily = dedupeDailyRowsByGroupIdKeepLatest(
    await fetchAllSupabaseRows<DailyAdminRow>(
      TABLES.groupScrapeDaily,
      'group_id, group_name, invite_link, is_admin, brand, platform, scraped_at',
      [{ column: 'account_id', value: input.accountId }],
    ),
  );

  return daily
    .filter(
      (row) =>
        row.is_admin === 'yes' &&
        String(row.brand ?? '').trim() === brand &&
        row.platform === input.platform,
    )
    .map((row) => ({
      groupId: String(row.group_id ?? '').trim(),
      groupName: String(row.group_name ?? '').trim() || String(row.group_id ?? '').trim(),
      inviteLink: row.invite_link?.trim() || null,
    }))
    .filter((row) => row.groupId)
    .sort((a, b) => a.groupName.localeCompare(b.groupName));
}
