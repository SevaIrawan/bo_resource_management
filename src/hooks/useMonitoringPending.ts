import { useContext } from 'react';
import { MonitoringPendingContext } from '@/contexts/monitoring-pending-context';

export function useMonitoringPending() {
  const ctx = useContext(MonitoringPendingContext);
  if (!ctx) {
    throw new Error('useMonitoringPending must be used within DashboardProviders');
  }
  return ctx;
}
