import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GroupMonitoringContext } from '@/contexts/group-monitoring-context';
import { useAuth } from '@/hooks/useAuth';
import { useAutoAccountSync } from '@/hooks/useAutoAccountSync';
import { useRealtimeAccountSessions } from '@/hooks/useRealtimeAccountSessions';
import { useRealtimeMonitoring } from '@/hooks/useRealtimeMonitoring';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { assertRmSchema } from '@/lib/assertRmSchema';
import { getErrorMessage } from '@/lib/errorMessage';
import { loadAccountMonitoringGroups } from '@/lib/loadAccountMonitoring';
import { loadOpenTicketsForUser } from '@/lib/loadTickets';
import { reconcileTicketsForAccount } from '@/lib/reconcileTickets';
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
import { groupOpenTickets } from '@/lib/ticketGroups';
import { computeAccountKpis, computeTicketKpis } from '@/lib/monitoringKpis';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { TicketItem } from '@/types/ticketMonitoringUi';

interface GroupMonitoringProviderProps {
  children: ReactNode;
}

export function GroupMonitoringProvider({ children }: GroupMonitoringProviderProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { setTicketCount } = useMonitoringTab();
  const [groups, setGroups] = useState<AccountBrandGroup[]>([]);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [probeSuspendAccountIds, setProbeSuspendAccountIds] = useState<string[]>([]);
  const [accountFilters, setAccountFilters] = useState(ACCOUNT_FILTER_DEFAULT);
  const [ticketFilters, setTicketFilters] = useState(TICKET_FILTER_DEFAULT);
  const [dismissedBrandGroupIds, setDismissedBrandGroupIds] = useState<string[]>([]);
  const [workflowTick, setWorkflowTick] = useState(0);

  const reportError = useCallback((message: string) => {
    setError(message);
  }, []);

  const reloadTicketHandles = useCallback(async (loaded: TicketItem[]) => {
    const accountIds = [...new Set(loaded.map((ticket) => ticket.accountId))];
    try {
      const handles = await loadIssueHandlesForAccounts(accountIds);
      const summaries = groupOpenTickets(loaded);
      const synced = await resetReopenedCompletedHandles(summaries, handles);
      hydrateTicketProcessCache(synced);
    } catch {
      hydrateTicketProcessCache({});
    }
  }, []);

  const reloadTickets = useCallback(async () => {
    if (!user?.id) {
      setTickets([]);
      hydrateTicketProcessCache({});
      return;
    }
    const loaded = await loadOpenTicketsForUser(user.id);
    setTickets(loaded);
    await reloadTicketHandles(loaded);
  }, [user?.id, reloadTicketHandles]);

  const reloadAll = useCallback(async () => {
    if (!user?.id) {
      setGroups([]);
      setTickets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await assertRmSchema();
      const loadedGroups = await loadAccountMonitoringGroups(user.id);
      await Promise.all(
        loadedGroups.flatMap((group) =>
          group.dbBrandId
            ? group.accounts.map((acc) =>
                reconcileTicketsForAccount({
                  accountId: acc.id,
                  brandId: group.dbBrandId!,
                  brandName: group.brandName,
                  platform: acc.platform,
                }),
              )
            : [],
        ),
      );
      const loadedTickets = await loadOpenTicketsForUser(user.id);
      setGroups(loadedGroups);
      setTickets(loadedTickets);
      await reloadTicketHandles(loadedTickets);
    } catch (e) {
      setError(getErrorMessage(e, t('groupMonitoring.loadAccountsFailed')));
      setGroups([]);
      setTickets([]);
      hydrateTicketProcessCache({});
    } finally {
      setLoading(false);
    }
  }, [user?.id, t, reloadTicketHandles]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  const ticketSummaries = useMemo(() => groupOpenTickets(tickets), [tickets]);

  const dismissBrandGroup = useCallback((groupId: string) => {
    setDismissedBrandGroupIds((prev) => (prev.includes(groupId) ? prev : [...prev, groupId]));
  }, []);

  const dismissedBrandSet = useMemo(() => new Set(dismissedBrandGroupIds), [dismissedBrandGroupIds]);

  const filteredGroups = useMemo(
    () =>
      filterAccountGroups(groups, accountFilters).filter((g) => !dismissedBrandSet.has(g.id)),
    [groups, accountFilters, dismissedBrandSet],
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
    void reloadTickets();
  }, [reloadTickets]);

  const handleRegistryRealtime = useCallback(() => {
    void reloadAll();
  }, [reloadAll]);

  const autoSyncState = useAutoAccountSync({
    userId: user?.id,
    groups,
    onGroupsChange: setGroups,
    enabled: Boolean(user?.id),
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

  useRealtimeMonitoring({
    userId: user?.id ?? null,
    enabled: Boolean(user?.id) && !loading,
    suspendAccountIds: probeSuspendAccountIds,
    onGroupsChange: setGroups,
    onTicketsChange: handleTicketsRealtime,
    onRegistryChange: handleRegistryRealtime,
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
      tickets,
      ticketSummaries,
      filteredTicketSummaries,
      ticketFilters,
      setTicketFilters,
      reloadTickets,
      accountKpis,
      ticketKpis,
      loading,
      reportError,
      setProbeSuspendAccountIds,
      dismissBrandGroup,
    }),
    [
      groups,
      filteredGroups,
      accountFilters,
      tickets,
      ticketSummaries,
      filteredTicketSummaries,
      dismissBrandGroup,
      ticketFilters,
      accountKpis,
      ticketKpis,
      loading,
      reportError,
      reloadTickets,
    ],
  );

  if (error && !loading && groups.length === 0) {
    return <p className="account-sync-loading">{error}</p>;
  }

  return (
    <GroupMonitoringContext.Provider value={value}>{children}</GroupMonitoringContext.Provider>
  );
}
