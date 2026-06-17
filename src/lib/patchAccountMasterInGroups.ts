import { rebuildGroupMetrics } from '@/lib/accountBrandUtils';
import { countBrandMasterGroups } from '@/lib/brandStandardCount';
import { fetchMasterGroupStatsForAccount, patchMasterTotalsOnRow } from '@/lib/accountSyncData';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

/** Setelah rebuild groups_master — refresh semua akun brand+platform di UI. */
export async function patchBrandPlatformMasterInGroups(
  groups: AccountBrandGroup[],
  brandName: string,
  platform: Platform,
): Promise<AccountBrandGroup[]> {
  const brandKey = brandName.trim();
  if (!brandKey) return groups;

  const brandX = await countBrandMasterGroups(brandKey, platform);
  let changed = false;

  const next = await Promise.all(
    groups.map(async (group) => {
      if (group.brandName.trim() !== brandKey) return group;

      let groupChanged = false;
      const accounts = await Promise.all(
        group.accounts.map(async (account) => {
          if (account.platform !== platform) return account;
          groupChanged = true;
          changed = true;
          const master = await fetchMasterGroupStatsForAccount({
            accountId: account.id,
            brand: brandKey,
            platform,
            forceFresh: true,
          });
          return patchMasterTotalsOnRow(account, master, brandX);
        }),
      );

      if (!groupChanged) return group;

      const standardGroupCountByPlatform = {
        ...group.standardGroupCountByPlatform,
        [platform]: brandX,
      };

      return rebuildGroupMetrics({
        ...group,
        accounts,
        standardGroupCountByPlatform,
        standardGroupCount: Math.max(
          group.standardGroupCount,
          ...Object.values(standardGroupCountByPlatform).filter(
            (n): n is number => typeof n === 'number',
          ),
          0,
        ),
      });
    }),
  );

  return changed ? next : groups;
}

/** Satu akun — dipakai snapshot realtime per account_id. */
export async function patchAccountMasterInGroups(
  groups: AccountBrandGroup[],
  accountId: string,
): Promise<AccountBrandGroup[]> {
  const hit = groups
    .flatMap((g) => g.accounts)
    .find((a) => a.id === accountId);
  if (!hit) return groups;
  return patchBrandPlatformMasterInGroups(groups, hit.brandName, hit.platform);
}
