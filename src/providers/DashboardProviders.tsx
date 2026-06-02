import type { ReactNode } from 'react';
import { AutoSyncSettingsProvider } from '@/contexts/AutoSyncSettingsContext';
import { SidebarContext } from '@/contexts/sidebar-context';
import {
  MonitoringTabContext,
  type MonitoringRefreshHandler,
} from '@/contexts/monitoring-tab-context';
import { SIDEBAR_DEFAULT_COLLAPSED } from '@/config/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { MonitoringTab } from '@/types/monitoring';

interface DashboardProvidersProps {
  children: ReactNode;
}

export function DashboardProviders({ children }: DashboardProvidersProps) {
  const [collapsed, setCollapsed] = useState(SIDEBAR_DEFAULT_COLLAPSED);
  const [tab, setTab] = useState<MonitoringTab>('account');
  const [ticketCount, setTicketCount] = useState(0);
  const refreshHandlerRef = useRef<MonitoringRefreshHandler | null>(null);

  const toggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const registerRefreshHandler = useCallback((handler: MonitoringRefreshHandler | null) => {
    refreshHandlerRef.current = handler;
  }, []);

  const refreshActiveTab = useCallback(async () => {
    await refreshHandlerRef.current?.(tab);
  }, [tab]);

  const sidebarValue = useMemo(
    () => ({ collapsed, toggle }),
    [collapsed, toggle],
  );

  const monitoringValue = useMemo(
    () => ({
      tab,
      setTab,
      ticketCount,
      setTicketCount,
      refreshActiveTab,
      registerRefreshHandler,
    }),
    [tab, ticketCount, refreshActiveTab, registerRefreshHandler],
  );

  return (
    <AutoSyncSettingsProvider>
      <SidebarContext.Provider value={sidebarValue}>
        <MonitoringTabContext.Provider value={monitoringValue}>
          {children}
        </MonitoringTabContext.Provider>
      </SidebarContext.Provider>
    </AutoSyncSettingsProvider>
  );
}
