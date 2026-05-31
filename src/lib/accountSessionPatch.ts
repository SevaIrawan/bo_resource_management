import { rebuildGroupMetrics } from '@/lib/accountBrandUtils';
import { snapshotToSyncFields } from '@/lib/accountSnapshots';
import { accountRowAfterSessionInvalid } from '@/lib/accountSessionUi';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { SessionUiStatus } from '@/types/accountMonitoringUi';
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

export function patchAccountSnapshotInGroups(
  groups: AccountBrandGroup[],
  snap: AccountSnapshot,
): AccountBrandGroup[] {
  return groups.map((group) => {
    const accounts = group.accounts.map((account) => {
      if (account.id !== snap.account_id) return account;
      const fields = snapshotToSyncFields(
        snap,
        account.platform,
        account.brandName,
        account.accountName,
        account.phoneNumber,
      );
      return {
        ...account,
        status: fields.status ?? account.status,
        sessionStatus: fields.sessionStatus ?? account.sessionStatus,
        syncState: fields.syncState ?? account.syncState,
        groupsCurrent: fields.groupsCurrent ?? account.groupsCurrent,
        groupsTotal: fields.groupsTotal ?? account.groupsTotal,
        adminCurrent: fields.adminCurrent ?? account.adminCurrent,
        adminTotal: fields.adminTotal ?? account.adminTotal,
        isMisaligned: fields.isMisaligned ?? account.isMisaligned,
        lastSyncAt: fields.lastSyncAt ?? account.lastSyncAt,
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
