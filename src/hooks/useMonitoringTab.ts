import { useContext } from 'react';
import { MonitoringTabContext } from '@/contexts/monitoring-tab-context';

export function useMonitoringTab() {
  const ctx = useContext(MonitoringTabContext);
  if (!ctx) {
    throw new Error('useMonitoringTab must be used within DashboardProviders');
  }
  return ctx;
}
