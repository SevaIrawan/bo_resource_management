import { useContext } from 'react';
import { AccountSyncFlowContext } from '@/contexts/account-sync-flow-context';

export function useAccountSyncFlowContext() {
  const ctx = useContext(AccountSyncFlowContext);
  if (!ctx) {
    throw new Error('useAccountSyncFlowContext must be used within GroupMonitoringProvider');
  }
  return ctx;
}
