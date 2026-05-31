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
    adminCurrent: account.adminCurrent,
    isMisaligned: x > 0 || account.adminCurrent > 0,
    syncState: account.syncState === 'pending' ? 'pending' : 'synced',
  };
}

export function syncResultForInvalidSession(
  brandStandard: number,
  adminFromMaster = 0,
): AccountSyncResult {
  const x = brandStandard > 0 ? brandStandard : 0;
  return {
    groupsCurrent: 0,
    groupsTotal: x,
    adminCurrent: adminFromMaster,
    adminTotal: x,
    sessionStatus: 'invalid',
  };
}
