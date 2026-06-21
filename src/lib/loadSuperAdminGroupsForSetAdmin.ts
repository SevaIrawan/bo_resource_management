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

async function loadTargetAdminGroupIdsByAccount(input: {
  accountIds: string[];
  brandName: string;
  platform: Platform;
}): Promise<Map<string, Set<string>>> {
  const brand = input.brandName.trim();
  const adminByGroup = new Map<string, Set<string>>();
  const accountIds = input.accountIds.filter(Boolean);
  if (!brand || accountIds.length === 0) return adminByGroup;

  await Promise.all(
    accountIds.map(async (accountId) => {
      const daily = dedupeDailyRowsByGroupIdKeepLatest(
        await fetchAllSupabaseRows<DailyAdminRow>(
          TABLES.groupScrapeDaily,
          'group_id, group_name, invite_link, is_admin, brand, platform, scraped_at',
          [{ column: 'account_id', value: accountId }],
        ),
      );

      for (const row of daily) {
        if (row.is_admin !== 'yes') continue;
        if (String(row.brand ?? '').trim() !== brand || row.platform !== input.platform) continue;
        const groupId = String(row.group_id ?? '').trim();
        if (!groupId) continue;
        if (!adminByGroup.has(groupId)) adminByGroup.set(groupId, new Set());
        adminByGroup.get(groupId)!.add(accountId);
      }
    }),
  );

  return adminByGroup;
}

/**
 * Owner-admin groups where at least one target is not admin yet (latest daily).
 */
export async function filterSetAdminGroupsForTargets(input: {
  ownerGroups: SuperAdminGroupForSetAdmin[];
  targetAccountIds: string[];
  brandName: string;
  platform: Platform;
}): Promise<SuperAdminGroupForSetAdmin[]> {
  const targetAccountIds = input.targetAccountIds.filter(Boolean);
  if (targetAccountIds.length === 0) return [];

  const targetAdminByGroup = await loadTargetAdminGroupIdsByAccount({
    accountIds: targetAccountIds,
    brandName: input.brandName,
    platform: input.platform,
  });

  return input.ownerGroups.filter((group) =>
    targetAccountIds.some((targetId) => !targetAdminByGroup.get(group.groupId)?.has(targetId)),
  );
}
