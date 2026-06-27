import {
  applySyncResultToGroup,
  patchBrandGroup,
  rebuildGroupMetrics,
  type AccountSyncResult,
} from '@/lib/accountBrandUtils';
import { upsertAccountSnapshot } from '@/lib/accountSnapshots';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Dispatch, SetStateAction } from 'react';

export async function applyScrapeMetricsToGroups(
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>,
  groupId: string,
  accountId: string,
  result: AccountSyncResult,
  meta?: {
    masterTotal?: number;
    lastSyncAt?: string | null;
    preserveActionProcess?: boolean;
    preserveSession?: boolean;
    sessionOnly?: boolean;
  },
): Promise<void> {
  const snapshotPending: Array<{
    account: AccountBrandRow;
    brandId: string;
    brandStandard: number;
  }> = [];

  onGroupsChange((prev) => {
    const group = prev.find((g) => g.id === groupId);
    const account = group?.accounts.find((r) => r.id === accountId);
    const brandStandard =
      group && account ? (group.standardGroupCountByPlatform?.[account.platform] ?? 0) : 0;

    if (group?.dbBrandId && account) {
      if (meta?.sessionOnly) {
        snapshotPending.push({ account, brandId: group.dbBrandId, brandStandard });
      } else if (!meta?.preserveSession) {
        snapshotPending.push({ account, brandId: group.dbBrandId, brandStandard });
      }
    }

    return patchBrandGroup(prev, groupId, (g) => {
      const next = applySyncResultToGroup(g, accountId, result, {
        masterTotal: meta?.masterTotal,
        lastSyncAt: meta?.lastSyncAt,
        preserveActionProcess: meta?.preserveActionProcess,
        preserveSession: meta?.preserveSession,
        sessionOnly: meta?.sessionOnly,
      });
      return rebuildGroupMetrics(next);
    });
  });

  const snap = snapshotPending[0];
  if (!snap) return;

  let resolvedBrandId: string | undefined = snap.brandId;
  if (!resolvedBrandId) {
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.messagingAccounts)
        .select('brand_id')
        .eq('id', accountId)
        .maybeSingle();
      resolvedBrandId = data?.brand_id as string | undefined;
    }
  }

  if (!resolvedBrandId) return;

  const snapshotResult = meta?.sessionOnly
    ? {
        groupsCurrent: snap.account.groupsCurrent,
        groupsTotal: snap.account.groupsTotal,
        adminCurrent: snap.account.adminCurrent,
        adminTotal: snap.account.adminTotal,
        sessionStatus: 'valid' as const,
      }
    : result;

  await upsertAccountSnapshot({
    account: {
      ...snap.account,
      status: meta?.sessionOnly ? 'active' : snap.account.status,
      sessionStatus: meta?.sessionOnly ? 'valid' : snap.account.sessionStatus,
    },
    brandId: resolvedBrandId,
    result: snapshotResult,
    brandStandard: snap.brandStandard,
    masterTotal: meta?.masterTotal,
    lastSyncAt: meta?.lastSyncAt,
  });
}
