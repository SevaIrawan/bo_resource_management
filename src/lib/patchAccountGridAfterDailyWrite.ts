import { patchGroupsFromDailyInState } from '@/lib/hydrateAccountMetricsFromDaily';
import { patchBrandPlatformMasterInGroups } from '@/lib/patchAccountMasterInGroups';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

/**
 * Satu pass in-memory: daily akun (Y/admin) lalu master brand+platform (X semua akun).
 * Hindari race baca state React antara dua patch terpisah.
 */
export async function patchAccountGridAfterDailyWrite(
  groups: AccountBrandGroup[],
  dbAccountId: string,
): Promise<AccountBrandGroup[]> {
  const withDaily = await patchGroupsFromDailyInState(groups, dbAccountId);
  const hit = withDaily.flatMap((g) => g.accounts).find((a) => a.id === dbAccountId);
  if (!hit) return withDaily;
  return patchBrandPlatformMasterInGroups(withDaily, hit.brandName, hit.platform);
}
