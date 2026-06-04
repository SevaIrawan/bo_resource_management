import { patchGroupsFromDailyInState } from '@/lib/hydrateAccountMetricsFromDaily';
import { mergeGroupsAccountMetrics } from '@/lib/mergeMonitoringGroups';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Dispatch, SetStateAction } from 'react';

/** Patch metrik baris akun dari daily DB (setelah scrape/sync). */
export async function patchAccountGroupsFromDailyInState(
  groups: AccountBrandGroup[],
  dbAccountId: string,
): Promise<AccountBrandGroup[]> {
  return patchGroupsFromDailyInState(groups, dbAccountId);
}

export function applyAccountGroupsDailyPatch(
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>,
  dbAccountId: string,
): Promise<void> {
  return new Promise((resolve) => {
    onGroupsChange((current) => {
      void patchGroupsFromDailyInState(current, dbAccountId).then((patched) => {
        onGroupsChange((prev) => mergeGroupsAccountMetrics(prev, patched));
        resolve();
      });
      return current;
    });
  });
}
