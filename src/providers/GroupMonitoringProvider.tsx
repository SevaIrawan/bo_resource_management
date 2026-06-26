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
import { clearMasterDailyLoadCache } from '@/lib/masterDailyLoadCache';
import { resolveMonitoringUserId } from '@/lib/monitoringDataUser';
import {
  ACCOUNT_FILTER_DEFAULT,
  filterAccountGroups,
} from '@/lib/filterAccountGroups';
import { patchAccountGridAfterDailyWrite } from '@/lib/patchAccountGridAfterDailyWrite';
import { dispatchMonitoringReloadAfterDailyWrite } from '@/lib/monitoringRealtimeEvents';
import { mergeGroupsAccountMetrics, mergeReloadPreservingActionProcess } from '@/lib/mergeMonitoringGroups';
import { computeAccountKpis } from '@/lib/monitoringKpis';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

interface GroupMonitoringProviderProps {
  children: ReactNode;
}

export function GroupMonitoringProvider({ children }: GroupMonitoringProviderProps) {
  const { user } = useAuth();
  const { canAutoSync } = usePermissions();
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
      window.dispatchEvent(new Event('rm-reporting-reload'));
    }, 500);
  }, []);

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
        dispatchMonitoringReloadAfterDailyWrite();
      } finally {
        accountRefreshBusyRef.current.delete(dbAccountId);
        if (pendingAccountRefreshRef.current.has(dbAccountId)) {
          pendingAccountRefreshRef.current.delete(dbAccountId);
          void refreshAccountAfterDailyWrite(dbAccountId);
        }
      }
    },
    [patchAccountGridFromDb],
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
      if (activeTab === 'reporting') {
        window.dispatchEvent(new Event('rm-reporting-reload'));
      } else {
        await reloadAll();
      }
    });
    return () => registerRefreshHandler(null);
  }, [registerRefreshHandler, reloadAll]);

  useEffect(() => {
    registerFullRefreshHandler(async () => {
      await reloadAll();
      window.dispatchEvent(new Event('rm-reporting-reload'));
    });
    return () => registerFullRefreshHandler(null);
  }, [registerFullRefreshHandler, reloadAll]);

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
    onAccountDailyChanged: handleAccountDailyChanged,
    onRegistryChange: handleRegistryRealtime,
    onDataChangeNotice: notifyPendingDataUpdate,
    onMasterDataChanged: scheduleReportingReload,
  });

  const accountKpis = useMemo(() => computeAccountKpis(groups), [groups]);

  const value = useMemo(
    () => ({
      groups,
      filteredGroups,
      accountFilters,
      setAccountFilters,
      onGroupsChange: setGroups,
      accountKpis,
      loading,
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
      reportError,
      refreshAccountAfterDailyWrite,
    ],
  );

  if (error && !loading && groups.length === 0) {
    return <p className="account-sync-loading">{error}</p>;
  }

  return (
    <GroupMonitoringContext.Provider value={value}>{children}</GroupMonitoringContext.Provider>
  );
}
