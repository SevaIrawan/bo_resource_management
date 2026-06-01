import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { applySyncResultToGroup } from '@/lib/accountBrandUtils';
import { findAccountInGroups } from '@/lib/accountSessionPatch';
import { invalidSessionMetricsFromDaily } from '@/lib/accountSessionUi';
import { upsertAccountSnapshot } from '@/lib/accountSnapshots';
import {
  handleDeviceSessionInvalid,
  resolveAccountIdFromDeviceSession,
} from '@/lib/platformSessionSync';
import { readLatestSessionUiStatus } from '@/lib/sessionUiFromDatabase';
import { isAccountInSessionGrace } from '@/lib/sessionRealtimePolicy';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

interface UseRealtimeAccountSessionsOptions {
  groups: AccountBrandGroup[];
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  enabled?: boolean;
  suspendProbeAccountIds?: string[];
}

type SessionRow = {
  account_id?: string;
  is_active?: boolean;
};

function isProtected(accountId: string, suspended: Set<string>): boolean {
  return suspended.has(accountId) || isAccountInSessionGrace(accountId);
}

/**
 * Realtime session: UI hanya ikut DB saat **logout/invalid** (`is_active` false).
 * Jangan set VALID dari DB saja — badge valid hanya dari probe device / Sync / login sukses.
 */
export function useRealtimeAccountSessions({
  groups,
  onGroupsChange,
  enabled = true,
  suspendProbeAccountIds = [],
}: UseRealtimeAccountSessionsOptions) {
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const suspendedRef = useRef(suspendProbeAccountIds);
  suspendedRef.current = suspendProbeAccountIds;

  const accountIdsKey = useMemo(
    () =>
      groups
        .flatMap((g) => g.accounts.map((a) => a.id))
        .sort()
        .join(','),
    [groups],
  );

  /** Badge session = baris platform_sessions terbaru (bukan event baris lama di history). */
  const refreshSessionBadgeFromDatabase = useCallback(
    async (accountId: string) => {
      if (isProtected(accountId, new Set(suspendedRef.current))) return;

      const status = await readLatestSessionUiStatus(accountId);
      const found = findAccountInGroups(groupsRef.current, accountId);

      if (status !== 'invalid' || !found) {
        return;
      }

      const result = await invalidSessionMetricsFromDaily({
        accountId: found.account.id,
        brand: found.account.brandName,
        platform: found.account.platform,
        brandStandard:
          found.group.standardGroupCountByPlatform?.[found.account.platform] ||
          found.account.groupsTotal,
      });
      onGroupsChange((prev) =>
        prev.map((group) =>
          group.id === found.group.id
            ? applySyncResultToGroup(group, accountId, result)
            : group,
        ),
      );
      if (found.group.dbBrandId) {
        void upsertAccountSnapshot({
          account: { ...found.account, ...result, status: 'logout', sessionStatus: 'invalid' },
          brandId: found.group.dbBrandId,
          result,
        });
      }
    },
    [onGroupsChange],
  );

  const syncAllSessionsFromDatabase = useCallback(async () => {
    const accountIds = groupsRef.current.flatMap((g) => g.accounts.map((a) => a.id));
    await Promise.all(
      accountIds.map((accountId) => refreshSessionBadgeFromDatabase(accountId)),
    );
  }, [refreshSessionBadgeFromDatabase]);

  const applyFromDbRow = useCallback(
    (row: SessionRow) => {
      const accountId = row.account_id;
      if (!accountId) return;
      void refreshSessionBadgeFromDatabase(accountId);
    },
    [refreshSessionBadgeFromDatabase],
  );

  useEffect(() => {
    if (!enabled || !accountIdsKey) return;
    void syncAllSessionsFromDatabase();
  }, [enabled, accountIdsKey, syncAllSessionsFromDatabase]);

  useEffect(() => {
    if (!enabled) return;

    const unsubInvalid = window.electronAPI?.onSessionInvalid?.((payload) => {
      if (isProtected(payload.sessionId, new Set(suspendedRef.current))) return;

      void (async () => {
        const accountId =
          (await resolveAccountIdFromDeviceSession(payload.sessionId, payload.platform)) ??
          payload.sessionId;
        if (isProtected(accountId, new Set(suspendedRef.current))) return;

        await handleDeviceSessionInvalid(payload);
      })();
    });

    return () => {
      unsubInvalid?.();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel('rm-platform-sessions-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: TABLES.platformSessions,
        },
        (payload) => {
          applyFromDbRow(payload.new as SessionRow);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: TABLES.platformSessions,
        },
        (payload) => {
          applyFromDbRow(payload.new as SessionRow);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void syncAllSessionsFromDatabase();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, applyFromDbRow, syncAllSessionsFromDatabase]);

  return {};
}
