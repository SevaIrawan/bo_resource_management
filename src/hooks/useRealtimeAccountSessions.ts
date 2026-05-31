import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { findAccountInGroups, patchAccountSessionInGroups } from '@/lib/accountSessionPatch';
import { syncResultForInvalidSession } from '@/lib/accountSessionUi';
import { upsertAccountSnapshot } from '@/lib/accountSnapshots';
import {
  handleDeviceSessionInvalid,
  resolveAccountIdFromDeviceSession,
} from '@/lib/platformSessionSync';
import { isAccountInLoginGrace } from '@/lib/sessionRealtimePolicy';
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
  return suspended.has(accountId) || isAccountInLoginGrace(accountId);
}

/**
 * Realtime session: percaya baris DB + event logout dari device.
 * Tidak ada probe Electron tiap 20 detik (bentrok login/sync).
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

  const applyUiSession = useCallback(
    (accountId: string, status: 'valid' | 'invalid') => {
      onGroupsChange((prev) => {
        const next = patchAccountSessionInGroups(prev, accountId, status);
        if (status === 'invalid') {
          const found = findAccountInGroups(next, accountId);
          if (found?.group.dbBrandId) {
            void upsertAccountSnapshot({
              account: found.account,
              brandId: found.group.dbBrandId,
              result: syncResultForInvalidSession(
                found.group.standardGroupCountByPlatform?.[found.account.platform] ||
                  found.account.groupsTotal,
                found.account.adminCurrent,
              ),
            });
          }
        }
        return next;
      });
    },
    [onGroupsChange],
  );

  const applyFromDbRow = useCallback(
    (row: SessionRow) => {
      const accountId = row.account_id;
      if (!accountId || isProtected(accountId, new Set(suspendedRef.current))) return;

      if (row.is_active === true) {
        applyUiSession(accountId, 'valid');
        return;
      }
      if (row.is_active === false) {
        applyUiSession(accountId, 'invalid');
      }
    },
    [applyUiSession],
  );

  useEffect(() => {
    if (!enabled) return;

    const unsubInvalid = window.electronAPI?.onSessionInvalid?.((payload) => {
      if (isProtected(payload.sessionId, new Set(suspendedRef.current))) return;

      void (async () => {
        await handleDeviceSessionInvalid(payload);
        const accountId =
          (await resolveAccountIdFromDeviceSession(payload.sessionId, payload.platform)) ??
          payload.sessionId;
        if (!isProtected(accountId, new Set(suspendedRef.current))) {
          applyUiSession(accountId, 'invalid');
        }
      })();
    });

    return () => {
      unsubInvalid?.();
    };
  }, [enabled, applyUiSession]);

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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, applyFromDbRow]);

  return {};
}
