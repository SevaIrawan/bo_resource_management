import type { ReactNode } from 'react';
import { SidebarContext } from '@/contexts/sidebar-context';
import { MonitoringTabContext } from '@/contexts/monitoring-tab-context';
import { SIDEBAR_DEFAULT_COLLAPSED } from '@/config/navigation';
import { useCallback, useMemo, useState } from 'react';
import type { MonitoringTab } from '@/types/monitoring';

interface DashboardProvidersProps {
  children: ReactNode;
}

export function DashboardProviders({ children }: DashboardProvidersProps) {
  const [collapsed, setCollapsed] = useState(SIDEBAR_DEFAULT_COLLAPSED);
  const [tab, setTab] = useState<MonitoringTab>('account');
  const ticketCount = 4;

  const toggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const sidebarValue = useMemo(
    () => ({ collapsed, toggle }),
    [collapsed, toggle],
  );

  const monitoringValue = useMemo(
    () => ({ tab, setTab, ticketCount }),
    [tab, ticketCount],
  );

  return (
    <SidebarContext.Provider value={sidebarValue}>
      <MonitoringTabContext.Provider value={monitoringValue}>
        {children}
      </MonitoringTabContext.Provider>
    </SidebarContext.Provider>
  );
}
