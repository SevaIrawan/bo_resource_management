import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GroupMonitoringContext } from '@/contexts/group-monitoring-context';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useAutoAccountSync } from '@/hooks/useAutoAccountSync';
import { useRealtimeAccountSessions } from '@/hooks/useRealtimeAccountSessions';
import { useRealtimeMonitoring } from '@/hooks/useRealtimeMonitoring';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { useMonitoringPending } from '@/hooks/useMonitoringPending';
import { assertRmSchema } from '@/lib/assertRmSchema';
import { getErrorMessage } from '@/lib/errorMessage';
import { loadAccountMonitoringGroups } from '@/lib/loadAccountMonitoring';
import { buildTicketSummariesForUser } from '@/lib/buildTicketSummariesFromEngine';
import { resolveMonitoringUserId } from '@/lib/monitoringDataUser';
import {
  ACCOUNT_FILTER_DEFAULT,
  filterAccountGroups,
} from '@/lib/filterAccountGroups';
import {
  filterTicketSummaries,
  TICKET_FILTER_DEFAULT,
} from '@/lib/filterTicketSummaries';
import {
  loadIssueHandlesForAccounts,
  resetReopenedCompletedHandles,
} from '@/lib/ticketWorkflowDb';
import {
  hydrateTicketProcessCache,
  TICKET_WORKFLOW_CHANGED_EVENT,
} from '@/lib/ticketWorkflowLocal';
import type { TicketSummaryGroup } from '@/lib/ticketGroups';
import { applyAccountGroupsDailyPatch } from '@/lib/patchAccountGroupsFromDaily';
import { reconcileOpenTicketsForUser, reconcileTicketsForAccountFromDb } from '@/lib/reconcileTickets';
import { computeAccountKpis, computeTicketKpis } from '@/lib/monitoringKpis';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
/** Bump saat logic ticket berubah — paksa reload (HMR tidak remount provider). */
const TICKET_SYNC_VERSION = '6';
const TICKET_SYNC_STORAGE_KEY = 'rm-ticket-sync-version';

interface GroupMonitoringProviderProps {
  children: ReactNode;
}

export function GroupMonitoringProvider({ children }: GroupMonitoringProviderProps) {
  const { user } = useAuth();
  const { canAutoSync } = usePermissions();
  const { registerRefreshHandler, registerFullRefreshHandler } = useMonitoringTab();
  const { notifyPendingDataUpdate } = useMonitoringPending();
  const { t } = useLanguage();
  const { setTicketCount } = useMonitoringTab();
  const [groups, setGroups] = useState<AccountBrandGroup[]>([]);
  const [ticketSummaries, setTicketSummaries] = useState<TicketSummaryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [probeSuspendAccountIds, setProbeSuspendAccountIds] = useState<string[]>([]);
  const [accountFilters, setAccountFilters] = useState(ACCOUNT_FILTER_DEFAULT);
  const [ticketFilters, setTicketFilters] = useState(TICKET_FILTER_DEFAULT);
  const [workflowTick, setWorkflowTick] = useState(0);
  const ticketReconcileBusyRef = useRef(false);
  const reloadAllBusyRef = useRef(false);
  const reloadAllSeqRef = useRef(0);
  /** Blok realtime ticket reload saat reconcile — cegah UI angka sementara (11,5,5,4). */
  const ticketSyncLockedRef = useRef(false);
  const ticketReloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportError = useCallback((message: string) => {
    setError(message);
  }, []);

  const reloadTicketHandles = useCallback(async (summaries: TicketSummaryGroup[]) => {
    const accountIds = [...new Set(summaries.map((s) => s.accountId))];
    try {
      const handles = await loadIssueHandlesForAccounts(accountIds);
      const synced = await resetReopenedCompletedHandles(summaries, handles);
      hydrateTicketProcessCache(synced);
    } catch {
      hydrateTicketProcessCache({});
    }
  }, []);

  /** UI ticket = engine master↔daily (sama bookmark), bukan hitung baris load DB. */
  const reloadTicketSummaries = useCallback(async () => {
    if (ticketSyncLockedRef.current) return;
    if (!user?.id) {
      setTicketSummaries([]);
      hydrateTicketProcessCache({});
      return;
    }
    const dataUserId = await resolveMonitoringUserId(user.id, user.userName);
    const summaries = await buildTicketSummariesForUser(dataUserId);
    setTicketSummaries(summaries);
    await reloadTicketHandles(summaries);
  }, [user?.id, user?.userName, reloadTicketHandles]);

  const runTicketReconcile = useCallback(async () => {
    if (!user?.id || ticketReconcileBusyRef.current) return;
    ticketReconcileBusyRef.current = true;
    ticketSyncLockedRef.current = true;
    try {
      const dataUserId = await resolveMonitoringUserId(user.id, user.userName);
      await reconcileOpenTicketsForUser(dataUserId, { concurrency: 1 });
      const summaries = await buildTicketSummariesForUser(dataUserId);
      setTicketSummaries(summaries);
      await reloadTicketHandles(summaries);
      const loadedGroups = await loadAccountMonitoringGroups(dataUserId);
      setGroups(loadedGroups);
    } catch (e) {
      reportError(getErrorMessage(e, t('groupMonitoring.ticketReconcileFailed')));
    } finally {
      ticketSyncLockedRef.current = false;
      ticketReconcileBusyRef.current = false;
    }
  }, [user?.id, user?.userName, reloadTicketHandles, reportError, t]);

  /** Reconcile DB dulu, lalu reload kartu Issue (kontrak 150−146=4 ticket). */
  const refreshIssues = useCallback(
    async (dbAccountId?: string) => {
      ticketSyncLockedRef.current = true;
      try {
        if (dbAccountId) {
          await reconcileTicketsForAccountFromDb(dbAccountId);
          await applyAccountGroupsDailyPatch(setGroups, dbAccountId);
        } else if (user?.id) {
          await runTicketReconcile();
          return;
        }
        await reloadTicketSummaries();
      } finally {
        ticketSyncLockedRef.current = false;
      }
    },
    [user?.id, runTicketReconcile, reloadTicketSummaries],
  );

  const handleAccountDailyChanged = useCallback(
    (dbAccountId: string) => {
      notifyPendingDataUpdate();
      void (async () => {
        ticketSyncLockedRef.current = true;
        try {
          await reconcileTicketsForAccountFromDb(dbAccountId);
          await applyAccountGroupsDailyPatch(setGroups, dbAccountId);
          await reloadTicketSummaries();
        } finally {
          ticketSyncLockedRef.current = false;
        }
      })();
    },
    [notifyPendingDataUpdate, reloadTicketSummaries],
  );

  /** Realtime master/daily — refresh kartu dari engine (tanpa reconcile DB). */
  const scheduleIssueRefreshFromData = useCallback(() => {
    void reloadTicketSummaries();
  }, [reloadTicketSummaries]);

  const reloadAll = useCallback(async () => {
    if (!user?.id) {
      setGroups([]);
      setTicketSummaries([]);
      setLoading(false);
      return;
    }
    if (reloadAllBusyRef.current) return;

    const seq = ++reloadAllSeqRef.current;
    reloadAllBusyRef.current = true;
    setLoading(true);
    setError(null);

    try {
      try {
        localStorage.setItem(TICKET_SYNC_STORAGE_KEY, TICKET_SYNC_VERSION);
      } catch {
        /* private mode */
      }

      await assertRmSchema();
      const dataUserId = await resolveMonitoringUserId(user.id, user.userName);

      const [loadedGroups, summaries] = await Promise.all([
        loadAccountMonitoringGroups(dataUserId),
        buildTicketSummariesForUser(dataUserId),
      ]);
      if (seq !== reloadAllSeqRef.current) return;
      setGroups(loadedGroups);
      setTicketSummaries(summaries);
      await reloadTicketHandles(summaries);
    } catch (e) {
      if (seq !== reloadAllSeqRef.current) return;
      setError(getErrorMessage(e, t('groupMonitoring.loadAccountsFailed')));
      setGroups([]);
      setTicketSummaries([]);
      hydrateTicketProcessCache({});
    } finally {
      if (seq === reloadAllSeqRef.current) {
        setLoading(false);
      }
      reloadAllBusyRef.current = false;
    }
  }, [user?.id, user?.userName, t, reloadTicketHandles]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    registerRefreshHandler(async (activeTab) => {
      if (activeTab === 'ticket') {
        await runTicketReconcile();
      } else {
        await reloadAll();
      }
    });
    return () => registerRefreshHandler(null);
  }, [registerRefreshHandler, reloadAll, runTicketReconcile]);

  useEffect(() => {
    registerFullRefreshHandler(async () => {
      await reloadAll();
    });
    return () => registerFullRefreshHandler(null);
  }, [registerFullRefreshHandler, reloadAll]);

  const filteredGroups = useMemo(
    () => filterAccountGroups(groups, accountFilters),
    [groups, accountFilters],
  );

  const filteredTicketSummaries = useMemo(
    () => filterTicketSummaries(ticketSummaries, ticketFilters),
    [ticketSummaries, ticketFilters, workflowTick],
  );

  useEffect(() => {
    const bump = () => setWorkflowTick((n) => n + 1);
    window.addEventListener(TICKET_WORKFLOW_CHANGED_EVENT, bump);
    return () => window.removeEventListener(TICKET_WORKFLOW_CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    setTicketCount(ticketSummaries.length);
  }, [ticketSummaries.length, setTicketCount]);

  const handleTicketsRealtime = useCallback(() => {
    if (ticketSyncLockedRef.current) return;
    notifyPendingDataUpdate();
    if (ticketReloadDebounceRef.current) clearTimeout(ticketReloadDebounceRef.current);
    ticketReloadDebounceRef.current = setTimeout(() => {
      ticketReloadDebounceRef.current = null;
      if (ticketSyncLockedRef.current) return;
      void reloadTicketSummaries();
    }, 500);
  }, [notifyPendingDataUpdate, reloadTicketSummaries]);

  const reloadGroupsOnly = useCallback(async () => {
    if (!user?.id) return;
    try {
      const dataUserId = await resolveMonitoringUserId(user.id, user.userName);
      const loadedGroups = await loadAccountMonitoringGroups(dataUserId);
      setGroups(loadedGroups);
    } catch {
      /* tetap tampilkan data lama */
    }
  }, [user?.id, user?.userName]);

  const handleRegistryRealtime = useCallback(() => {
    void reloadGroupsOnly();
    notifyPendingDataUpdate();
  }, [notifyPendingDataUpdate, reloadGroupsOnly]);

  const autoSyncState = useAutoAccountSync({
    userId: user?.id,
    groups,
    onGroupsChange: setGroups,
    enabled: Boolean(user?.id) && canAutoSync,
    loading,
    suspendAccountIds: probeSuspendAccountIds,
  });
  const autoSyncRunning = autoSyncState?.isRunning ?? false;

  const realtimeSuspendIds = useMemo(() => {
    if (!autoSyncRunning) return probeSuspendAccountIds;
    const all = groups.flatMap((g) => g.accounts.map((a) => a.id));
    return [...new Set([...probeSuspendAccountIds, ...all])];
  }, [autoSyncRunning, groups, probeSuspendAccountIds]);

  useRealtimeAccountSessions({
    groups,
    onGroupsChange: setGroups,
    enabled: Boolean(user?.id) && !loading,
    suspendProbeAccountIds: realtimeSuspendIds,
  });

  const [monitoringUserId, setMonitoringUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setMonitoringUserId(null);
      return;
    }
    let cancelled = false;
    void resolveMonitoringUserId(user.id, user.userName).then((id) => {
      if (!cancelled) setMonitoringUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.userName]);

  useRealtimeMonitoring({
    userId: monitoringUserId,
    enabled: Boolean(monitoringUserId) && !loading,
    suspendAccountIds: probeSuspendAccountIds,
    onGroupsChange: setGroups,
    onTicketsChange: handleTicketsRealtime,
    onIssueReconcile: scheduleIssueRefreshFromData,
    onAccountDailyChanged: handleAccountDailyChanged,
    onRegistryChange: handleRegistryRealtime,
    onDataChangeNotice: notifyPendingDataUpdate,
  });

  const accountKpis = useMemo(
    () => computeAccountKpis(groups, ticketSummaries.length),
    [groups, ticketSummaries.length],
  );
  const ticketKpis = useMemo(() => computeTicketKpis(ticketSummaries), [ticketSummaries]);

  const value = useMemo(
    () => ({
      groups,
      filteredGroups,
      accountFilters,
      setAccountFilters,
      onGroupsChange: setGroups,
      tickets: [],
      ticketSummaries,
      filteredTicketSummaries,
      ticketFilters,
      setTicketFilters,
      reloadTickets: reloadTicketSummaries,
      refreshIssues: refreshIssues,
      accountKpis,
      ticketKpis,
      loading,
      reportError,
      setProbeSuspendAccountIds,
    }),
    [
      groups,
      filteredGroups,
      accountFilters,
      ticketSummaries,
      filteredTicketSummaries,
      ticketFilters,
      accountKpis,
      ticketKpis,
      loading,
      reportError,
      reloadTicketSummaries,
      refreshIssues,
    ],
  );

  if (error && !loading && groups.length === 0) {
    return <p className="account-sync-loading">{error}</p>;
  }

  return (
    <GroupMonitoringContext.Provider value={value}>{children}</GroupMonitoringContext.Provider>
  );
}
