import { isMisalignedFromSyncResult } from '@/lib/accountDisplayMetrics';
import { normalizeLocationDeviceOption } from '@/config/locationDeviceOptions';
import { buildStandardCountByPlatformFromRows } from '@/lib/brandStandardCount';
import { ensureBrand } from '@/lib/brands';
import type { Dispatch, SetStateAction } from 'react';
import type { AccountBrandGroup, AddAccountInput } from '@/types/accountMonitoringUi';
import type { SessionUiStatus } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export const DEFAULT_EMPTY_SLOT_COUNT = 3;

export interface AccountSyncResult {
  groupsCurrent: number;
  groupsTotal: number;
  adminCurrent: number;
  adminTotal: number;
  sessionStatus: SessionUiStatus;
}

/** ID kartu brand stabil; pakai UUID brand DB bila ada (unik, tidak tabrakan nama). */
export function brandGroupId(brandName: string, dbBrandId?: string): string {
  if (dbBrandId) return `brand-${dbBrandId}`;
  const slug = brandName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return `brand-${slug || 'unknown'}`;
}

/** Patch satu kartu brand di state grid. */
export function patchBrandGroup(
  groups: AccountBrandGroup[],
  groupId: string,
  patcher: (group: AccountBrandGroup) => AccountBrandGroup,
): AccountBrandGroup[] {
  return groups.map((group) => (group.id === groupId ? patcher(group) : group));
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

export function createEmptyBrandGroup(
  brandName: string,
  dbBrandId?: string,
): AccountBrandGroup {
  const name = brandName.trim();
  const id = brandGroupId(name, dbBrandId);

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

/** Tambah kartu brand kosong ke grid (Account tab — card bawah atau quick + header). */
export async function appendBrandGroupFromName(
  brandName: string,
  userId: string | undefined,
  setGroups: Dispatch<SetStateAction<AccountBrandGroup[]>>,
): Promise<void> {
  const name = brandName.trim();
  if (!name) return;

  let dbBrandId: string | undefined;
  if (userId) {
    const brand = await ensureBrand({ userId, brandName: name });
    dbBrandId = brand.id;
  }
  const nextGroup = { ...createEmptyBrandGroup(name, dbBrandId), dbBrandId };

  setGroups((prev) => {
    const exists = prev.some(
      (g) =>
        g.brandName.trim().toLowerCase() === name.toLowerCase() ||
        (dbBrandId && g.dbBrandId === dbBrandId),
    );
    if (exists) return prev;
    return [...prev, nextGroup].sort((a, b) => a.brandName.localeCompare(b.brandName));
  });
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
  const locationDevice = normalizeLocationDeviceOption(input.locationDevice?.trim() ?? '');
  const newRow = {
    id: input.dbAccountId ?? createAccountRowId(),
    platform: input.platform,
    accountName: input.accountName.trim(),
    phoneNumber: phone,
    locationDevice: locationDevice || undefined,
    brandName: group.brandName,
    status: 'logout' as const,
    groupsCurrent: 0,
    groupsTotal: 0,
    joinedInMaster: 0,
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
  options?: {
    masterTotal?: number;
    lastSyncAt?: string | null;
    preserveActionProcess?: boolean;
    /** Scrape sukses tanpa login — jangan ubah status/session kolom grid. */
    preserveSession?: boolean;
    /** Sync/Later kontrak — hanya Session+Status (+ syncState), metrik grid tidak berubah. */
    sessionOnly?: boolean;
  },
): AccountBrandGroup {
  const accounts = group.accounts.map((account) => {
    if (account.id !== accountId) return account;

    const lastSyncAt =
      options?.lastSyncAt !== undefined ? options.lastSyncAt : account.lastSyncAt;

    if (options?.sessionOnly) {
      return {
        ...account,
        status: 'active' as const,
        sessionStatus: 'valid' as const,
        syncState: 'synced' as const,
        lastSyncAt,
        actionProcess: options?.preserveActionProcess ? account.actionProcess : null,
      };
    }

    const isMisaligned = isMisalignedFromSyncResult(result);

    return {
      ...account,
      status: options?.preserveSession
        ? account.status
        : result.sessionStatus === 'valid'
          ? ('active' as const)
          : ('logout' as const),
      groupsCurrent: result.groupsCurrent,
      groupsTotal: result.groupsTotal,
      joinedInMaster:
        options?.masterTotal != null && options.masterTotal >= 0
          ? options.masterTotal
          : account.joinedInMaster,
      adminCurrent: result.adminCurrent,
      adminTotal: result.adminTotal,
      sessionStatus: options?.preserveSession ? account.sessionStatus : result.sessionStatus,
      actionProcess: options?.preserveActionProcess ? account.actionProcess : null,
      syncState: 'synced' as const,
      isMisaligned,
      lastSyncAt,
    };
  });

  return rebuildGroupMetrics({ ...group, accounts });
}

export function patchAccountDetailsInGroups(
  groups: AccountBrandGroup[],
  groupId: string,
  accountId: string,
  patch: {
    accountName: string;
    phoneNumber: string;
    locationDevice: string;
  },
): AccountBrandGroup[] {
  return patchBrandGroup(groups, groupId, (group) => ({
    ...group,
    accounts: group.accounts.map((account) =>
      account.id === accountId
        ? {
            ...account,
            accountName: patch.accountName.trim(),
            phoneNumber: patch.phoneNumber.trim(),
            locationDevice: normalizeLocationDeviceOption(patch.locationDevice) || undefined,
          }
        : account,
    ),
  }));
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

/** Setelah scrape: sinkronkan X standar brand per platform ke semua akun platform yang sama. */
export function patchBrandStandardCountForPlatform(
  groups: AccountBrandGroup[],
  groupId: string,
  platform: Platform,
  accountId: string,
  brandX: number,
): AccountBrandGroup[] {
  if (brandX <= 0) return groups;
  return patchBrandGroup(groups, groupId, (g) =>
    rebuildGroupMetrics({
      ...g,
      standardGroupCountByPlatform: {
        ...g.standardGroupCountByPlatform,
        [platform]: brandX,
      },
      accounts: g.accounts.map((row) =>
        row.platform === platform && row.id !== accountId
          ? { ...row, groupsTotal: brandX, adminTotal: brandX }
          : row,
      ),
    }),
  );
}
