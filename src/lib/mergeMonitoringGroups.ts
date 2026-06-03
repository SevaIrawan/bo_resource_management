import { rebuildGroupMetrics } from '@/lib/accountBrandUtils';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';

function metricFieldsFromRow(row: AccountBrandRow): Partial<AccountBrandRow> {
  return {
    groupsCurrent: row.groupsCurrent,
    groupsTotal: row.groupsTotal,
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
