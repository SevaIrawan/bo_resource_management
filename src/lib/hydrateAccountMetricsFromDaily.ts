import { applySyncResultToGroup } from '@/lib/accountBrandUtils';
import { buildMetricsFromScrapeDaily } from '@/lib/accountSyncData';
import { findAccountInGroups } from '@/lib/accountSessionPatch';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

/** Groups/Admin di UI = hitung dari `group_scrape_daily` (account_id), bukan snapshot. */
export async function patchGroupsFromDailyInState(
  groups: AccountBrandGroup[],
  lookupAccountId: string,
  dbAccountId?: string,
): Promise<AccountBrandGroup[]> {
  const metricsAccountId = dbAccountId ?? lookupAccountId;
  const found = findAccountInGroups(
    groups,
    lookupAccountId,
    dbAccountId && dbAccountId !== lookupAccountId ? [dbAccountId] : [],
  );
  if (!found) return groups;

  const { result, master } = await buildMetricsFromScrapeDaily({
    accountId: metricsAccountId,
    brand: found.account.brandName,
    platform: found.account.platform,
    sessionValid: found.account.sessionStatus === 'valid',
    forceFresh: true,
  });

  return groups.map((group) =>
    group.id === found.group.id
      ? applySyncResultToGroup(group, found.account.id, result, {
          masterTotal: master.joinedInMaster,
        })
      : group,
  );
}
