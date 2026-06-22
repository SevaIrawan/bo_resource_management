import { TABLES } from '@/config/tables';
import { dedupeDailyRowsByGroupIdKeepLatest } from '@/lib/dedupeScrapeDaily';
import {
  computeAccountTicketBreakdown,
  loadMasterDailyForAccount,
} from '@/lib/accountMasterDailyCompare';
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

/**
 * Owner-admin groups where target sudah join (ada di daily master brand) tapi belum admin.
 * Selaras ticket not_admin — bukan grup yang target belum join sama sekali.
 */
export async function filterSetAdminGroupsForTargets(input: {
  ownerGroups: SuperAdminGroupForSetAdmin[];
  targetAccountIds: string[];
  brandName: string;
  platform: Platform;
}): Promise<SuperAdminGroupForSetAdmin[]> {
  const targetAccountIds = input.targetAccountIds.filter(Boolean);
  if (targetAccountIds.length === 0 || input.ownerGroups.length === 0) return [];

  const ownerGroupIds = new Set(input.ownerGroups.map((group) => group.groupId));
  const eligibleGroupIds = new Set<string>();

  await Promise.all(
    targetAccountIds.map(async (targetId) => {
      const { masterRows, dailyRows } = await loadMasterDailyForAccount({
        accountId: targetId,
        brandName: input.brandName,
        platform: input.platform,
      });
      const breakdown = computeAccountTicketBreakdown(masterRows, dailyRows);
      for (const row of breakdown.notAdmin) {
        const groupId = row.groupId.trim();
        if (groupId && ownerGroupIds.has(groupId)) {
          eligibleGroupIds.add(groupId);
        }
      }
    }),
  );

  return input.ownerGroups.filter((group) => eligibleGroupIds.has(group.groupId));
}
