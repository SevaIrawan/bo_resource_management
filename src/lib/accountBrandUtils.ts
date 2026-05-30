import type { AccountBrandGroup, AddAccountInput } from '@/types/accountMonitoringUi';

export const DEFAULT_EMPTY_SLOT_COUNT = 3;

export function nextBrandLabel(groups: AccountBrandGroup[]): string {
  const used = new Set(groups.map((group) => group.brandLabel));

  for (let index = 0; index < 26; index += 1) {
    const label = String.fromCharCode(65 + index);
    if (!used.has(label)) return label;
  }

  return String(groups.length + 1);
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

export function createEmptyBrandGroup(
  brandName: string,
  brandLabel: string,
): AccountBrandGroup {
  const name = brandName.trim();
  const id = createBrandId();

  return {
    id,
    brandLabel,
    brandName: name,
    accountCount: 0,
    standardGroupCount: 0,
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
  const phone = input.phoneOrUsername?.trim() ?? '';
  const newRow = {
    id: input.dbAccountId ?? createAccountRowId(),
    platform: input.platform,
    accountName: input.accountName.trim(),
    phoneOrUsername: phone,
    brandName: group.brandName,
    status: 'logout' as const,
    groupsCurrent: 0,
    groupsTotal: 0,
    adminCurrent: 0,
    adminTotal: 0,
    syncState: 'pending' as const,
  };

  let emptySlots = group.emptySlots;
  if (input.slotId) {
    emptySlots = group.emptySlots.filter((slot) => slot.id !== input.slotId);
  } else if (emptySlots.length > 0) {
    emptySlots = emptySlots.slice(1);
  }

  const accounts = [...group.accounts, newRow];
  const misalignedCount = accounts.filter(
    (account) =>
      account.syncState === 'synced' &&
      (account.groupsCurrent < account.groupsTotal ||
        account.adminCurrent < account.adminTotal),
  ).length;

  return {
    ...group,
    accounts,
    emptySlots,
    accountCount: accounts.length,
    misalignedCount,
  };
}
