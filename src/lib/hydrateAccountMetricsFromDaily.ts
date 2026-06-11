import { applySyncResultToGroup } from '@/lib/accountBrandUtils';
import { buildMetricsFromScrapeDaily } from '@/lib/accountSyncData';
import { findAccountInGroups } from '@/lib/accountSessionPatch';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

/** Groups/Admin di UI = hitung dari `group_scrape_daily` (account_id), bukan snapshot. */
export async function patchGroupsFromDailyInState(
  groups: AccountBrandGroup[],
  accountId: string,
): Promise<AccountBrandGroup[]> {
  const found = findAccountInGroups(groups, accountId);
  if (!found) return groups;

  const { result, master } = await buildMetricsFromScrapeDaily({
    accountId: found.account.id,
    brand: found.account.brandName,
    platform: found.account.platform,
    sessionValid: found.account.sessionStatus === 'valid',
  });

  return groups.map((group) =>
    group.id === found.group.id
      ? applySyncResultToGroup(group, accountId, result, {
          masterTotal: master.joinedInMaster,
        })
      : group,
  );
}
