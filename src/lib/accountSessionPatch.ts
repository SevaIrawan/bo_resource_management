import { rebuildGroupMetrics } from '@/lib/accountBrandUtils';
import { accountRowAfterSessionInvalid } from '@/lib/accountSessionUi';
import type { AccountBrandGroup, AccountBrandRow, SessionUiStatus } from '@/types/accountMonitoringUi';
import type { AccountSnapshot } from '@/types/database';

export function patchAccountSessionInGroups(
  groups: AccountBrandGroup[],
  accountId: string,
  sessionStatus: SessionUiStatus,
): AccountBrandGroup[] {
  return groups.map((group) => {
    const accounts = group.accounts.map((account) => {
      if (account.id !== accountId) return account;
      if (sessionStatus === 'valid') {
        return {
          ...account,
          sessionStatus: 'valid' as const,
          status: 'active' as const,
        };
      }
      return accountRowAfterSessionInvalid(account);
    });
    return rebuildGroupMetrics({ ...group, accounts });
  });
}

function isStaleSnapshot(account: AccountBrandRow, snap: AccountSnapshot): boolean {
  if (!snap.last_sync_at || !account.lastSyncAt) return false;
  const snapMs = Date.parse(snap.last_sync_at);
  const rowMs = Date.parse(account.lastSyncAt);
  if (Number.isNaN(snapMs) || Number.isNaN(rowMs)) return false;
  return snapMs < rowMs;
}

/**
 * Realtime snapshot — hanya sync_state / last_sync / misaligned.
 * Groups Y/X & Admin = `group_scrape_daily` (bukan snap.groups_current yang sering 0 saat logout).
 */
export function patchAccountSnapshotInGroups(
  groups: AccountBrandGroup[],
  snap: AccountSnapshot,
): AccountBrandGroup[] {
  return groups.map((group) => {
    const accounts = group.accounts.map((account) => {
      if (account.id !== snap.account_id) return account;
      if (isStaleSnapshot(account, snap)) return account;
      return {
        ...account,
        syncState: snap.sync_state === 'synced' ? 'synced' : account.syncState,
        lastSyncAt: snap.last_sync_at ?? account.lastSyncAt,
      };
    });
    return rebuildGroupMetrics({ ...group, accounts });
  });
}

export function findAccountInGroups(groups: AccountBrandGroup[], accountId: string) {
  for (const group of groups) {
    const account = group.accounts.find((row) => row.id === accountId);
    if (account) return { group, account };
  }
  return null;
}
