import { isMisalignedFromSyncResult } from '@/lib/accountDisplayMetrics';
import { buildStandardCountByPlatformFromRows } from '@/lib/brandStandardCount';
import type { AccountBrandGroup, AddAccountInput } from '@/types/accountMonitoringUi';
import type { SessionUiStatus } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

function platformStandardX(group: AccountBrandGroup, platform: Platform): number {
  const fromMap = group.standardGroupCountByPlatform?.[platform];
  if (fromMap != null && fromMap > 0) return fromMap;
  const fromRow = group.accounts.find((a) => a.platform === platform)?.groupsTotal;
  return fromRow ?? 0;
}

export const DEFAULT_EMPTY_SLOT_COUNT = 3;

export interface AccountSyncResult {
  groupsCurrent: number;
  groupsTotal: number;
  adminCurrent: number;
  adminTotal: number;
  sessionStatus: SessionUiStatus;
}

function createBrandId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `brand-${crypto.randomUUID()}`
    : `brand-${Date.now()}`;
}

export function createEmptyAccountSlots(
  brandName: string,
  groupId: string,
  count = DEFAULT_EMPTY_SLOT_COUNT,
) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${groupId}-slot-${index + 1}`,
    brandName,
  }));
}

export function createEmptyBrandGroup(brandName: string): AccountBrandGroup {
  const name = brandName.trim();
  const id = createBrandId();

  return {
    id,
    brandLabel: name,
    brandName: name,
    accountCount: 0,
    standardGroupCount: 0,
    standardGroupCountByPlatform: {},
    misalignedCount: 0,
    accounts: [],
    emptySlots: createEmptyAccountSlots(name, id),
  };
}

export function flattenBrandAccounts(groups: AccountBrandGroup[]) {
  return groups.flatMap((group) => group.accounts);
}

function createAccountRowId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `acc-${crypto.randomUUID()}`
    : `acc-${Date.now()}`;
}

export function addAccountToGroup(
  group: AccountBrandGroup,
  input: AddAccountInput,
): AccountBrandGroup {
  const phone = input.phoneNumber?.trim() ?? '';
  const newRow = {
    id: input.dbAccountId ?? createAccountRowId(),
    platform: input.platform,
    accountName: input.accountName.trim(),
    phoneNumber: phone,
    brandName: group.brandName,
    status: 'logout' as const,
    groupsCurrent: 0,
    groupsTotal: 0,
    adminCurrent: 0,
    adminTotal: 0,
    sessionStatus: 'invalid' as const,
    actionProcess: null,
    syncState: 'pending' as const,
    isMisaligned: false,
  };

  let emptySlots = group.emptySlots;
  if (input.slotId) {
    emptySlots = group.emptySlots.filter((slot) => slot.id !== input.slotId);
  } else if (emptySlots.length > 0) {
    emptySlots = emptySlots.slice(1);
  }

  const accounts = [...group.accounts, newRow];
  return rebuildGroupMetrics({ ...group, accounts, emptySlots });
}

/** Hapus baris akun dari card dan kembalikan satu slot kosong. */
export function removeAccountFromGroup(
  group: AccountBrandGroup,
  accountId: string,
): AccountBrandGroup {
  const accounts = group.accounts.filter((account) => account.id !== accountId);
  const slotId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `${group.id}-slot-${crypto.randomUUID()}`
      : `${group.id}-slot-${Date.now()}`;

  const emptySlots = [
    ...group.emptySlots,
    { id: slotId, brandName: group.brandName },
  ];

  return rebuildGroupMetrics({ ...group, accounts, emptySlots });
}

function countMisaligned(accounts: AccountBrandGroup['accounts']) {
  return accounts.filter((account) => account.isMisaligned).length;
}

export function rebuildGroupMetrics(group: AccountBrandGroup): AccountBrandGroup {
  const misalignedCount = countMisaligned(group.accounts);
  const standardGroupCountByPlatform = {
    ...group.standardGroupCountByPlatform,
    ...buildStandardCountByPlatformFromRows(group.accounts),
  };

  return {
    ...group,
    accounts: group.accounts,
    accountCount: group.accounts.length,
    standardGroupCount: 0,
    standardGroupCountByPlatform,
    misalignedCount,
  };
}

export function applySyncResultToGroup(
  group: AccountBrandGroup,
  accountId: string,
  result: AccountSyncResult,
  options?: { masterTotal?: number },
): AccountBrandGroup {
  const targetAccount = group.accounts.find((a) => a.id === accountId);
  const brandStandard = targetAccount
    ? platformStandardX(group, targetAccount.platform)
    : 0;
  const accounts = group.accounts.map((account) => {
    if (account.id !== accountId) return account;

    const isMisaligned = isMisalignedFromSyncResult(
      result,
      options?.masterTotal ?? 0,
      brandStandard,
    );

    return {
      ...account,
      status: result.sessionStatus === 'valid' ? ('active' as const) : ('logout' as const),
      groupsCurrent: result.groupsCurrent,
      groupsTotal: result.groupsTotal,
      adminCurrent: result.adminCurrent,
      adminTotal: result.adminTotal,
      sessionStatus: result.sessionStatus,
      actionProcess: null,
      syncState: 'synced' as const,
      isMisaligned,
      lastSyncAt: new Date().toISOString(),
    };
  });

  return rebuildGroupMetrics({ ...group, accounts });
}

export function setAccountProcessAction(
  group: AccountBrandGroup,
  accountId: string,
  action: AccountBrandGroup['accounts'][0]['actionProcess'],
): AccountBrandGroup {
  const accounts = group.accounts.map((account) =>
    account.id === accountId ? { ...account, actionProcess: action } : account,
  );
  return { ...group, accounts };
}
