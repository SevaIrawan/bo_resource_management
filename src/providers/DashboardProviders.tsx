import type { ReactNode } from 'react';
import { AutoSyncSettingsProvider } from '@/contexts/AutoSyncSettingsContext';
import { SidebarContext } from '@/contexts/sidebar-context';
import {
  MonitoringTabContext,
  type MonitoringFullRefreshHandler,
  type MonitoringRefreshHandler,
} from '@/contexts/monitoring-tab-context';
import { MonitoringPendingContext } from '@/contexts/monitoring-pending-context';
import { SIDEBAR_DEFAULT_COLLAPSED } from '@/config/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { MonitoringTab } from '@/types/monitoring';

interface DashboardProvidersProps {
  children: ReactNode;
}

export function DashboardProviders({ children }: DashboardProvidersProps) {
  const [collapsed, setCollapsed] = useState(SIDEBAR_DEFAULT_COLLAPSED);
  const [tab, setTab] = useState<MonitoringTab>('account');
  const [hasPendingDataUpdate, setHasPendingDataUpdate] = useState(false);
  const refreshHandlerRef = useRef<MonitoringRefreshHandler | null>(null);
  const fullRefreshHandlerRef = useRef<MonitoringFullRefreshHandler | null>(null);

  const toggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const registerRefreshHandler = useCallback((handler: MonitoringRefreshHandler | null) => {
    refreshHandlerRef.current = handler;
  }, []);

  const registerFullRefreshHandler = useCallback(
    (handler: MonitoringFullRefreshHandler | null) => {
      fullRefreshHandlerRef.current = handler;
    },
    [],
  );

  const refreshActiveTab = useCallback(async () => {
    await refreshHandlerRef.current?.(tab);
  }, [tab]);

  const refreshAllMonitoring = useCallback(async () => {
    await fullRefreshHandlerRef.current?.();
  }, []);

  const notifyPendingDataUpdate = useCallback(() => {
    setHasPendingDataUpdate(true);
  }, []);

  const clearPendingDataUpdate = useCallback(() => {
    setHasPendingDataUpdate(false);
  }, []);

  const sidebarValue = useMemo(
    () => ({ collapsed, toggle }),
    [collapsed, toggle],
  );

  const monitoringValue = useMemo(
    () => ({
      tab,
      setTab,
      refreshActiveTab,
      refreshAllMonitoring,
      registerRefreshHandler,
      registerFullRefreshHandler,
    }),
    [
      tab,
      refreshActiveTab,
      refreshAllMonitoring,
      registerRefreshHandler,
      registerFullRefreshHandler,
    ],
  );

  const pendingValue = useMemo(
    () => ({
      hasPendingDataUpdate,
      notifyPendingDataUpdate,
      clearPendingDataUpdate,
    }),
    [hasPendingDataUpdate, notifyPendingDataUpdate, clearPendingDataUpdate],
  );

  return (
    <AutoSyncSettingsProvider>
      <SidebarContext.Provider value={sidebarValue}>
        <MonitoringPendingContext.Provider value={pendingValue}>
          <MonitoringTabContext.Provider value={monitoringValue}>
            {children}
          </MonitoringTabContext.Provider>
        </MonitoringPendingContext.Provider>
      </SidebarContext.Provider>
    </AutoSyncSettingsProvider>
  );
}
