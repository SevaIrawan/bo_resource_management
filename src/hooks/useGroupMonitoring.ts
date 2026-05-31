import { useContext } from 'react';
import { GroupMonitoringContext } from '@/contexts/group-monitoring-context';

export function useGroupMonitoring() {
  const ctx = useContext(GroupMonitoringContext);
  if (!ctx) {
    throw new Error('useGroupMonitoring must be used within GroupMonitoringProvider');
  }
  return ctx;
}
