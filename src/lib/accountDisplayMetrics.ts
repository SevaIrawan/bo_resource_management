import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import type { MasterGroupStats } from '@/lib/accountSyncData';
import type { DeviceGroupCountResult } from '@/lib/runAccountCount';

/**
 * UI Groups: Y/X — Y = device, X = standar brand (master count).
 * UI Admin: admin di grup master / X.
 */
export function computeIsMisaligned(input: {
  brandStandard: number;
  deviceTotal: number;
  sessionValid: boolean;
  masterTotal: number;
}): boolean {
  const { brandStandard, deviceTotal, sessionValid, masterTotal } = input;

  if (brandStandard > 0) {
    if (!sessionValid) return true;
    return deviceTotal !== brandStandard;
  }

  if (!sessionValid) return masterTotal > 0;
  if (masterTotal <= 0) return false;
  return deviceTotal !== masterTotal;
}

export function buildAccountSyncResult(input: {
  master: MasterGroupStats;
  device: DeviceGroupCountResult;
  brandStandard: number;
}): AccountSyncResult {
  const { master, device, brandStandard } = input;
  const sessionValid = device.valid;
  const brandX =
    brandStandard > 0 ? brandStandard : master.brandMasterTotal;

  if (!sessionValid) {
    return {
      groupsCurrent: 0,
      groupsTotal: brandX,
      adminCurrent: master.adminInMaster,
      adminTotal: brandX,
      sessionStatus: 'invalid',
    };
  }

  return {
    groupsCurrent: device.totalGroups,
    groupsTotal: brandX,
    adminCurrent: master.adminInMaster,
    adminTotal: brandX,
    sessionStatus: 'valid',
  };
}

export function isMisalignedFromSyncResult(
  result: AccountSyncResult,
  masterTotal: number,
  brandStandard: number,
): boolean {
  return computeIsMisaligned({
    brandStandard,
    deviceTotal: result.sessionStatus === 'valid' ? result.groupsCurrent : 0,
    sessionValid: result.sessionStatus === 'valid',
    masterTotal,
  });
}
