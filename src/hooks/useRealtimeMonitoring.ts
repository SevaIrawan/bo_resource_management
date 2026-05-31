import { useEffect, useRef } from 'react';
import { TABLES } from '@/config/tables';
import { patchAccountSnapshotInGroups } from '@/lib/accountSessionPatch';
import { patchAccountMasterInGroups } from '@/lib/patchAccountMasterInGroups';
import { getSupabase } from '@/lib/supabase';
import type { AccountSnapshot } from '@/types/database';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Dispatch, SetStateAction } from 'react';

interface UseRealtimeMonitoringOptions {
  userId: string | null;
  enabled: boolean;
  /** Jangan patch UI dari realtime saat sync/scrape berjalan (cegah flash). */
  suspendAccountIds?: string[];
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  onTicketsChange: () => void;
  onRegistryChange: () => void;
}

export function useRealtimeMonitoring({
  userId,
  enabled,
  suspendAccountIds = [],
  onGroupsChange,
  onTicketsChange,
  onRegistryChange,
}: UseRealtimeMonitoringOptions) {
  const onGroupsChangeRef = useRef(onGroupsChange);
  const onTicketsChangeRef = useRef(onTicketsChange);
  const onRegistryChangeRef = useRef(onRegistryChange);
  const suspendedRef = useRef(suspendAccountIds);

  onGroupsChangeRef.current = onGroupsChange;
  onTicketsChangeRef.current = onTicketsChange;
  onRegistryChangeRef.current = onRegistryChange;
  suspendedRef.current = suspendAccountIds;

  useEffect(() => {
    if (!enabled || !userId) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const pendingMasterAccounts = new Set<string>();
    let masterFlushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushMasterPatches = () => {
      const ids = [...pendingMasterAccounts];
      pendingMasterAccounts.clear();
      if (!ids.length) return;

      onGroupsChangeRef.current((prev) => {
        void (async () => {
          let next = prev;
          for (const accountId of ids) {
            next = await patchAccountMasterInGroups(next, accountId);
          }
          onGroupsChangeRef.current(() => next);
          onTicketsChangeRef.current();
        })();
        return prev;
      });
    };

    const scheduleMasterPatch = (accountId: string) => {
      pendingMasterAccounts.add(accountId);
      if (masterFlushTimer) clearTimeout(masterFlushTimer);
      masterFlushTimer = setTimeout(() => {
        masterFlushTimer = null;
        flushMasterPatches();
      }, 400);
    };

    const channel = supabase
      .channel(`rm-monitoring-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.accountSnapshots },
        (payload) => {
          const row = (payload.new ?? payload.old) as AccountSnapshot | undefined;
          if (!row?.account_id) return;
          if (suspendedRef.current.includes(row.account_id)) return;
          onGroupsChangeRef.current((prev) => patchAccountSnapshotInGroups(prev, row));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.tickets },
        () => {
          onTicketsChangeRef.current();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.brands },
        () => {
          onRegistryChangeRef.current();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.messagingAccounts },
        () => {
          onRegistryChangeRef.current();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.scrapeRuns },
        () => {
          onTicketsChangeRef.current();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.groupsMaster },
        (payload) => {
          const row = (payload.new ?? payload.old) as { account_id?: string } | undefined;
          if (row?.account_id) scheduleMasterPatch(row.account_id);
        },
      )
      .subscribe();

    return () => {
      if (masterFlushTimer) clearTimeout(masterFlushTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);
}
