import { patchGroupsFromDailyInState } from '@/lib/hydrateAccountMetricsFromDaily';
import { findAccountInGroups } from '@/lib/accountSessionPatch';
import { patchBrandPlatformMasterInGroups } from '@/lib/patchAccountMasterInGroups';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

/**
 * Satu pass in-memory: daily akun (Y/admin) lalu master brand+platform (X semua akun).
 * Hindari race baca state React antara dua patch terpisah.
 */
export async function patchAccountGridAfterDailyWrite(
  groups: AccountBrandGroup[],
  dbAccountId: string,
  uiAccountId?: string,
): Promise<AccountBrandGroup[]> {
  const lookupId =
    findAccountInGroups(groups, dbAccountId)?.account.id ??
    (uiAccountId ? findAccountInGroups(groups, uiAccountId)?.account.id : undefined) ??
    dbAccountId;
  const withDaily = await patchGroupsFromDailyInState(groups, lookupId, dbAccountId);
  const hit = findAccountInGroups(withDaily, lookupId, [dbAccountId, uiAccountId ?? '']);
  if (!hit) return withDaily;
  return patchBrandPlatformMasterInGroups(withDaily, hit.account.brandName, hit.account.platform);
}
