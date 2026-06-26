import { rebuildGroupMetrics } from '@/lib/accountBrandUtils';
import type {
  AccountBrandGroup,
  AccountBrandRow,
  AccountProcessAction,
} from '@/types/accountMonitoringUi';

function metricFieldsFromRow(row: AccountBrandRow): Partial<AccountBrandRow> {
  return {
    groupsCurrent: row.groupsCurrent,
    groupsTotal: row.groupsTotal,
    joinedInMaster: row.joinedInMaster,
    adminCurrent: row.adminCurrent,
    adminTotal: row.adminTotal,
    isMisaligned: row.isMisaligned,
    syncState: row.syncState,
    lastSyncAt: row.lastSyncAt,
    sessionStatus: row.sessionStatus,
    status: row.status,
  };
}

/** Gabungkan metrik akun dari `source` ke `current` tanpa menimpa struktur terbaru (add/remove). */
export function mergeGroupsAccountMetrics(
  current: AccountBrandGroup[],
  source: AccountBrandGroup[],
): AccountBrandGroup[] {
  const sourceAccountById = new Map<string, AccountBrandRow>();
  const sourceGroupById = new Map(source.map((g) => [g.id, g]));

  for (const group of source) {
    for (const account of group.accounts) {
      sourceAccountById.set(account.id, account);
    }
  }

  return current.map((group) => {
    const sourceGroup = sourceGroupById.get(group.id);
    const accounts = group.accounts.map((account) => {
      const src = sourceAccountById.get(account.id);
      if (!src) return account;
      return { ...account, ...metricFieldsFromRow(src) };
    });

    return rebuildGroupMetrics({
      ...group,
      accounts,
      standardGroupCountByPlatform:
        sourceGroup?.standardGroupCountByPlatform ?? group.standardGroupCountByPlatform,
    });
  });
}

/**
 * Reload penuh dari DB — salin `actionProcess` dari state UI saat ini.
 * Spinner per akun (`processingByAccount` di useAccountSyncFlow) terpisah dan tidak ditimpa di sini.
 */
export function mergeReloadPreservingActionProcess(
  current: AccountBrandGroup[],
  loaded: AccountBrandGroup[],
): AccountBrandGroup[] {
  const preserve = new Map<string, AccountProcessAction>();
  for (const group of current) {
    for (const account of group.accounts) {
      if (account.actionProcess) preserve.set(account.id, account.actionProcess);
    }
  }
  if (preserve.size === 0) return loaded;

  return loaded.map((group) => ({
    ...group,
    accounts: group.accounts.map((account) => {
      const action = preserve.get(account.id);
      if (!action) return account;
      return { ...account, actionProcess: action };
    }),
  }));
}
