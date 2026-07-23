import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccountMonitoringSyncModals } from '@/components/group-monitoring/AccountMonitoringSyncModals';
import { AccountSyncFlowContext } from '@/contexts/account-sync-flow-context';
import { GroupMonitoringContext } from '@/contexts/group-monitoring-context';
import { useAuth } from '@/hooks/useAuth';
import { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';
import { usePermissions } from '@/hooks/usePermissions';
import { useAutoAccountSync } from '@/hooks/useAutoAccountSync';
import { useRealtimeAccountSessions } from '@/hooks/useRealtimeAccountSessions';
import { useRealtimeMonitoring } from '@/hooks/useRealtimeMonitoring';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { useMonitoringPending } from '@/hooks/useMonitoringPending';
import { assertRmSchema } from '@/lib/assertRmSchema';
import { getErrorMessage } from '@/lib/errorMessage';
import { loadAccountMonitoringGroups } from '@/lib/loadAccountMonitoring';
import { clearMasterDailyLoadCache } from '@/lib/masterDailyLoadCache';
import { resolveMonitoringUserId } from '@/lib/monitoringDataUser';
import {
  ACCOUNT_FILTER_DEFAULT,
  filterAccountGroups,
} from '@/lib/filterAccountGroups';
import { patchAccountGridAfterDailyWrite } from '@/lib/patchAccountGridAfterDailyWrite';
import {
  dispatchOperationsReload,
  dispatchReportingReload,
} from '@/lib/monitoringRealtimeEvents';
import { mergeGroupsAccountMetrics, mergeReloadPreservingActionProcess } from '@/lib/mergeMonitoringGroups';
import { computeAccountKpis } from '@/lib/monitoringKpis';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

interface GroupMonitoringProviderProps {
  children: ReactNode;
}

export function GroupMonitoringProvider({ children }: GroupMonitoringProviderProps) {
  const { user } = useAuth();
  const { canAutoSync, canOperatePlatform } = usePermissions();
  const { registerRefreshHandler, registerFullRefreshHandler } = useMonitoringTab();
  const { notifyPendingDataUpdate } = useMonitoringPending();
  const { t } = useLanguage();
  const [groups, setGroups] = useState<AccountBrandGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [probeSuspendAccountIds, setProbeSuspendAccountIds] = useState<string[]>([]);
  const [accountFilters, setAccountFilters] = useState(ACCOUNT_FILTER_DEFAULT);
  const reloadAllBusyRef = useRef(false);
  const reloadAllSeqRef = useRef(0);
  const reportingReloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationsReloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dailyChangeDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const accountRefreshBusyRef = useRef<Set<string>>(new Set());
  const pendingAccountRefreshRef = useRef<Set<string>>(new Set());

  const reportError = useCallback((message: string) => {
    setError(message);
  }, []);

  const scheduleReportingReload = useCallback(() => {
    if (reportingReloadDebounceRef.current) clearTimeout(reportingReloadDebounceRef.current);
    reportingReloadDebounceRef.current = setTimeout(() => {
      reportingReloadDebounceRef.current = null;
      dispatchReportingReload();
    }, 500);
  }, []);

  const scheduleOperationsReload = useCallback(() => {
    if (operationsReloadDebounceRef.current) clearTimeout(operationsReloadDebounceRef.current);
    operationsReloadDebounceRef.current = setTimeout(() => {
      operationsReloadDebounceRef.current = null;
      dispatchOperationsReload();
    }, 500);
  }, []);

  const scheduleMonitoringReload = useCallback(() => {
    scheduleReportingReload();
    scheduleOperationsReload();
  }, [scheduleReportingReload, scheduleOperationsReload]);

  const patchAccountGridFromDb = useCallback(async (dbAccountId: string) => {
    const snapshot = await new Promise<AccountBrandGroup[]>((resolve) => {
      setGroups((current) => {
        resolve(current);
        return current;
      });
    });
    const patched = await patchAccountGridAfterDailyWrite(snapshot, dbAccountId);
    setGroups((prev) => mergeGroupsAccountMetrics(prev, patched));
  }, []);

  const refreshAccountAfterDailyWrite = useCallback(
    async (dbAccountId: string) => {
      if (accountRefreshBusyRef.current.has(dbAccountId)) {
        pendingAccountRefreshRef.current.add(dbAccountId);
        return;
      }
      accountRefreshBusyRef.current.add(dbAccountId);
      try {
        await patchAccountGridFromDb(dbAccountId);
        scheduleMonitoringReload();
      } finally {
        accountRefreshBusyRef.current.delete(dbAccountId);
        if (pendingAccountRefreshRef.current.has(dbAccountId)) {
          pendingAccountRefreshRef.current.delete(dbAccountId);
          void refreshAccountAfterDailyWrite(dbAccountId);
        }
      }
    },
    [patchAccountGridFromDb, scheduleMonitoringReload],
  );

  const handleAccountDailyChanged = useCallback(
    (dbAccountId: string) => {
      notifyPendingDataUpdate();
      const pending = dailyChangeDebounceRef.current.get(dbAccountId);
      if (pending) clearTimeout(pending);
      dailyChangeDebounceRef.current.set(
        dbAccountId,
        setTimeout(() => {
          dailyChangeDebounceRef.current.delete(dbAccountId);
          void refreshAccountAfterDailyWrite(dbAccountId);
        }, 400),
      );
    },
    [notifyPendingDataUpdate, refreshAccountAfterDailyWrite],
  );

  const reloadAll = useCallback(async () => {
    if (!user?.id) {
      setGroups([]);
      setLoading(false);
      return;
    }
    if (reloadAllBusyRef.current) return;

    const seq = ++reloadAllSeqRef.current;
    reloadAllBusyRef.current = true;
    setLoading(true);
    setError(null);

    try {
      clearMasterDailyLoadCache();
      await assertRmSchema();
      const dataUserId = await resolveMonitoringUserId(user.id, user.userName);

      const loadedGroups = await loadAccountMonitoringGroups(dataUserId);
      if (seq !== reloadAllSeqRef.current) return;
      setGroups((prev) => mergeReloadPreservingActionProcess(prev, loadedGroups));
    } catch (e) {
      if (seq !== reloadAllSeqRef.current) return;
      setError(getErrorMessage(e, t('groupMonitoring.loadAccountsFailed')));
      setGroups([]);
      clearMasterDailyLoadCache();
    } finally {
      if (seq === reloadAllSeqRef.current) {
        setLoading(false);
      }
      reloadAllBusyRef.current = false;
    }
  }, [user?.id, user?.userName, t]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    registerRefreshHandler(async (activeTab) => {
      await reloadAll();
      // Matrix Group modal (Account header) ikut realtime via rm-reporting-reload.
      scheduleReportingReload();
      if (activeTab === 'operations') {
        scheduleOperationsReload();
      }
    });
    return () => registerRefreshHandler(null);
  }, [registerRefreshHandler, reloadAll, scheduleOperationsReload, scheduleReportingReload]);

  useEffect(() => {
    registerFullRefreshHandler(async () => {
      await reloadAll();
      scheduleMonitoringReload();
    });
    return () => registerFullRefreshHandler(null);
  }, [registerFullRefreshHandler, reloadAll, scheduleMonitoringReload]);

  const filteredGroups = useMemo(
    () => filterAccountGroups(groups, accountFilters),
    [groups, accountFilters],
  );

  const reloadGroupsOnly = useCallback(async () => {
    if (!user?.id) return;
    try {
      const dataUserId = await resolveMonitoringUserId(user.id, user.userName);
      const loadedGroups = await loadAccountMonitoringGroups(dataUserId);
      setGroups((prev) => mergeReloadPreservingActionProcess(prev, loadedGroups));
    } catch {
      /* tetap tampilkan data lama */
    }
  }, [user?.id, user?.userName]);

  const handleRegistryRealtime = useCallback(() => {
    void reloadGroupsOnly();
    notifyPendingDataUpdate();
    scheduleReportingReload();
  }, [notifyPendingDataUpdate, reloadGroupsOnly, scheduleReportingReload]);

  const autoSync = useAutoAccountSync({
    userId: user?.id,
    groups,
    onGroupsChange: setGroups,
    enabled: Boolean(user?.id) && canAutoSync,
    loading,
    suspendAccountIds: probeSuspendAccountIds,
  });

  const realtimeSuspendAccountIds = useMemo(() => {
    if (autoSync.activeAutoScrapeAccountIds.length === 0) return probeSuspendAccountIds;
    return [...new Set([...probeSuspendAccountIds, ...autoSync.activeAutoScrapeAccountIds])];
  }, [autoSync.activeAutoScrapeAccountIds, probeSuspendAccountIds]);

  useRealtimeAccountSessions({
    groups,
    onGroupsChange: setGroups,
    enabled: Boolean(user?.id) && !loading,
    suspendProbeAccountIds: realtimeSuspendAccountIds,
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
    suspendAccountIds: realtimeSuspendAccountIds,
    onGroupsChange: setGroups,
    onAccountDailyChanged: handleAccountDailyChanged,
    onRegistryChange: handleRegistryRealtime,
    onDataChangeNotice: notifyPendingDataUpdate,
    onMasterDataChanged: scheduleMonitoringReload,
    onOperationsMetricsChanged: scheduleOperationsReload,
  });

  const accountKpis = useMemo(() => computeAccountKpis(groups), [groups]);

  const sync = useAccountSyncFlow({
    onGroupsChange: setGroups,
    userId: user?.id ?? null,
    canOperatePlatform,
    translate: t,
  });

  const probeSuspendIds = useMemo(() => {
    const ids = new Set<string>();
    for (const accountId of Object.keys(sync.processingByAccount)) {
      ids.add(accountId);
      const dbId = sync.processingDbByAccount[accountId];
      if (dbId) ids.add(dbId);
    }
    if (sync.step === 'scrape-prompt' && sync.target?.account.id) {
      ids.add(sync.target.account.id);
    }
    if (sync.step === 'platform-login' && sync.target?.account.id) {
      ids.add(sync.target.account.id);
    }
    if (sync.target?.dbAccountId) {
      ids.add(sync.target.dbAccountId);
    }
    if (sync.postLoginGraceAccountId) {
      ids.add(sync.postLoginGraceAccountId);
    }
    return [...ids];
  }, [
    sync.postLoginGraceAccountId,
    sync.processingByAccount,
    sync.processingDbByAccount,
    sync.step,
    sync.target?.account.id,
    sync.target?.dbAccountId,
  ]);

  useEffect(() => {
    setProbeSuspendAccountIds(probeSuspendIds);
  }, [probeSuspendIds, setProbeSuspendAccountIds]);

  const value = useMemo(
    () => ({
      groups,
      filteredGroups,
      accountFilters,
      setAccountFilters,
      onGroupsChange: setGroups,
      accountKpis,
      loading,
      loadError: error,
      reportError,
      setProbeSuspendAccountIds,
      refreshAccountGrid: refreshAccountAfterDailyWrite,
    }),
    [
      groups,
      filteredGroups,
      accountFilters,
      accountKpis,
      loading,
      error,
      reportError,
      refreshAccountAfterDailyWrite,
    ],
  );

  return (
    <GroupMonitoringContext.Provider value={value}>
      <AccountSyncFlowContext.Provider value={sync}>
        <AccountMonitoringSyncModals sync={sync} />
        {children}
      </AccountSyncFlowContext.Provider>
    </GroupMonitoringContext.Provider>
  );
}
