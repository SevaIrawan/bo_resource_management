import { rebuildGroupMetrics } from '@/lib/accountBrandUtils';
import { applyMasterStatsToAccountRow, fetchMasterGroupStatsForAccount } from '@/lib/accountSyncData';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

/** Setelah rebuild groups_master brand — refresh metrik akun di UI. */
export async function patchAccountMasterInGroups(
  groups: AccountBrandGroup[],
  accountId: string,
): Promise<AccountBrandGroup[]> {
  let changed = false;

  const next = await Promise.all(
    groups.map(async (group) => {
      const accounts = await Promise.all(
        group.accounts.map(async (account) => {
          if (account.id !== accountId) return account;
          changed = true;
          const brandX =
            group.standardGroupCountByPlatform?.[account.platform] ?? account.groupsTotal;
          const master = await fetchMasterGroupStatsForAccount({
            accountId: account.id,
            brand: account.brandName,
            platform: account.platform,
          });
          return applyMasterStatsToAccountRow(account, master, {
            deviceConnected: account.sessionStatus === 'valid',
            brandStandard: brandX,
          });
        }),
      );
      return changed ? rebuildGroupMetrics({ ...group, accounts }) : group;
    }),
  );

  return changed ? next : groups;
}
