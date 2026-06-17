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

function readGroupsState(
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>,
): Promise<AccountBrandGroup[]> {
  return new Promise((resolve) => {
    onGroupsChange((current) => {
      resolve(current);
      return current;
    });
  });
}

export async function applyAccountGroupsDailyPatch(
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>,
  dbAccountId: string,
): Promise<void> {
  const snapshot = await readGroupsState(onGroupsChange);
  const patched = await patchGroupsFromDailyInState(snapshot, dbAccountId);
  onGroupsChange((prev) => mergeGroupsAccountMetrics(prev, patched));
}
