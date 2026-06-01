import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import { buildMetricsFromScrapeDaily } from '@/lib/accountSyncData';
import { computeIsMisaligned } from '@/lib/accountDisplayMetrics';
import type { Platform } from '@/types/database';

/** Session mati — badge logout; metrik Y/X tetap dari daily DB (jangan nolkan). */
export function accountRowAfterSessionInvalid(account: AccountBrandRow): AccountBrandRow {
  const x = Math.max(account.groupsTotal, 0);
  return {
    ...account,
    status: 'logout',
    sessionStatus: 'invalid',
    groupsTotal: x > 0 ? x : account.groupsTotal,
    adminTotal: x > 0 ? x : account.adminTotal,
    isMisaligned: computeIsMisaligned({
      groupsCurrent: account.groupsCurrent,
      groupsTotal: x > 0 ? x : account.groupsTotal,
      adminCurrent: account.adminCurrent,
      adminTotal: x > 0 ? x : account.adminTotal,
    }),
    syncState: account.syncState === 'pending' ? 'pending' : 'synced',
  };
}

/** Fallback sinkron — prefer `invalidSessionMetricsFromDaily`. */
export function syncResultForInvalidSession(
  brandStandard: number,
  adminFromMaster = 0,
  dailyGroups?: number,
): AccountSyncResult {
  const x = Math.max(0, brandStandard);
  const y = dailyGroups != null && dailyGroups >= 0 ? dailyGroups : 0;
  return {
    groupsCurrent: y,
    groupsTotal: x,
    adminCurrent: y > 0 ? adminFromMaster : 0,
    adminTotal: x,
    sessionStatus: 'invalid',
  };
}

/** Session invalid di DB — Groups/Admin dari `group_scrape_daily`, bukan 0. */
export async function invalidSessionMetricsFromDaily(input: {
  accountId: string;
  brand: string;
  platform: Platform;
  brandStandard?: number;
}): Promise<AccountSyncResult> {
  const { result } = await buildMetricsFromScrapeDaily({
    accountId: input.accountId,
    brand: input.brand,
    platform: input.platform,
    brandStandard: input.brandStandard,
    sessionValid: false,
  });
  return result;
}
