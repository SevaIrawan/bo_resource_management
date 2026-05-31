import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { findAccountInGroups, patchAccountSessionInGroups } from '@/lib/accountSessionPatch';
import { syncResultForInvalidSession } from '@/lib/accountSessionUi';
import { upsertAccountSnapshot } from '@/lib/accountSnapshots';
import { isProbeSkipMessage } from '@/lib/persistLoginSession';
import { probePlatformSession } from '@/lib/sessionProbe';
import { isAccountInLoginGrace } from '@/lib/sessionRealtimePolicy';
import { hasActivePlatformSession } from '@/lib/platformSessions';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

const PROBE_INTERVAL_MS = 60_000;
const DEACTIVATE_RECHECK_MS = 2_000;

interface UseRealtimeAccountSessionsOptions {
  groups: AccountBrandGroup[];
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  enabled?: boolean;
  suspendProbeAccountIds?: string[];
}

type SessionRow = {
  account_id?: string;
  is_active?: boolean;
  disconnect_reason?: string | null;
};

function isProtected(accountId: string, suspended: Set<string>): boolean {
  return suspended.has(accountId) || isAccountInLoginGrace(accountId);
}

export function useRealtimeAccountSessions({
  groups,
  onGroupsChange,
  enabled = true,
  suspendProbeAccountIds = [],
}: UseRealtimeAccountSessionsOptions) {
  const probingRef = useRef(false);
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

  const syncUiFromDatabase = useCallback(
    async (accountId: string) => {
      if (isProtected(accountId, new Set(suspendedRef.current))) return;

      const active = await hasActivePlatformSession(accountId);
      applyUiSession(accountId, active ? 'valid' : 'invalid');
    },
    [applyUiSession],
  );

  const handleDbSessionRow = useCallback(
    (row: SessionRow, event: 'INSERT' | 'UPDATE') => {
      const accountId = row.account_id;
      if (!accountId || isProtected(accountId, new Set(suspendedRef.current))) return;

      if (row.is_active === false) {
        // Jangan release device — row lama "replaced" sering datang sebelum INSERT baru.
        window.setTimeout(() => {
          void syncUiFromDatabase(accountId);
        }, DEACTIVATE_RECHECK_MS);
        return;
      }

      if (row.is_active === true) {
        applyUiSession(accountId, 'valid');
        if (event === 'INSERT') return;
      }
    },
    [applyUiSession, syncUiFromDatabase],
  );

  const probeAllAccounts = useCallback(async () => {
    if (!enabled || probingRef.current) return;
    if (!window.electronAPI?.scraper?.validateSession) return;

    probingRef.current = true;

    try {
      const suspended = new Set(suspendedRef.current);

      for (const group of groupsRef.current) {
        for (const account of group.accounts) {
          if (isProtected(account.id, suspended)) continue;

          const active = await hasActivePlatformSession(account.id);
          if (!active) {
            applyUiSession(account.id, 'invalid');
            continue;
          }

          const probe = await probePlatformSession({
            sessionId: account.id,
            platform: account.platform,
            accountId: account.id,
          });

          if (!probe.valid && !isProbeSkipMessage(probe.message)) {
            // Probe gagal ≠ session DB mati (client bisa idle setelah scrape).
            continue;
          }

          applyUiSession(account.id, 'valid');
        }
      }
    } finally {
      probingRef.current = false;
    }
  }, [applyUiSession, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const unsubInvalid = window.electronAPI?.onSessionInvalid?.((payload) => {
      if (isProtected(payload.sessionId, new Set(suspendedRef.current))) return;

      window.setTimeout(() => {
        void (async () => {
          if (isProtected(payload.sessionId, new Set(suspendedRef.current))) return;

          const active = await hasActivePlatformSession(payload.sessionId);
          if (active) {
            applyUiSession(payload.sessionId, 'valid');
            return;
          }

          applyUiSession(payload.sessionId, 'invalid');
        })();
      }, DEACTIVATE_RECHECK_MS);
    });

    void probeAllAccounts();

    const timer = window.setInterval(() => {
      void probeAllAccounts();
    }, PROBE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      unsubInvalid?.();
    };
  }, [enabled, applyUiSession, probeAllAccounts]);

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
          handleDbSessionRow(payload.new as SessionRow, 'INSERT');
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
          handleDbSessionRow(payload.new as SessionRow, 'UPDATE');
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, handleDbSessionRow]);

  return { probeAllAccounts };
}
