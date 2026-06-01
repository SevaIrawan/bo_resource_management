import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import type { MasterGroupStats } from '@/lib/accountSyncData';
import type { DeviceGroupCountResult } from '@/lib/runAccountCount';
import { isRowMisaligned } from '@/lib/accountSyncUiFlow';

/**
 * UI Groups: Y/X — Y = device, X = master brand (card).
 * UI Admin: admin di grup master / X.
 */
/** Issue / aligned — hanya metrik grup & admin; bukan session. */
export function computeIsMisaligned(input: {
  groupsCurrent: number;
  groupsTotal: number;
  adminCurrent: number;
  adminTotal: number;
}): boolean {
  return (
    input.groupsCurrent !== input.groupsTotal ||
    input.adminCurrent !== input.adminTotal
  );
}

export function buildAccountSyncResult(input: {
  master: MasterGroupStats;
  device: DeviceGroupCountResult;
  brandStandard: number;
}): AccountSyncResult {
  const { master, device, brandStandard } = input;
  const brandX = Math.max(0, brandStandard);
  const sessionValid = device.valid;

  if (!sessionValid) {
    return {
      groupsCurrent: 0,
      groupsTotal: brandX,
      adminCurrent: master.adminInMaster,
      adminTotal: brandX,
      sessionStatus: 'invalid',
    };
  }

  const adminY =
    typeof device.adminGroups === 'number' && device.adminGroups >= 0
      ? device.adminGroups
      : 0;

  return {
    groupsCurrent: device.totalGroups,
    groupsTotal: brandX,
    adminCurrent: adminY,
    adminTotal: brandX,
    sessionStatus: 'valid',
  };
}

export function isMisalignedFromSyncResult(result: AccountSyncResult): boolean {
  return isRowMisaligned(result);
}
