import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';

/** Session mati — Y = 0, X tetap standar brand. */
export function accountRowAfterSessionInvalid(account: AccountBrandRow): AccountBrandRow {
  const x = account.groupsTotal;
  return {
    ...account,
    status: 'logout',
    sessionStatus: 'invalid',
    groupsCurrent: 0,
    groupsTotal: x,
    adminTotal: x,
    adminCurrent: 0,
    isMisaligned:
      x > 0 ||
      account.adminCurrent > 0 ||
      account.adminCurrent !== account.adminTotal ||
      account.groupsCurrent !== x,
    syncState: account.syncState === 'pending' ? 'pending' : 'synced',
  };
}

export function syncResultForInvalidSession(
  brandStandard: number,
  _adminFromMaster = 0,
): AccountSyncResult {
  const x = Math.max(0, brandStandard);
  return {
    groupsCurrent: 0,
    groupsTotal: x,
    adminCurrent: 0,
    adminTotal: x,
    sessionStatus: 'invalid',
  };
}
