import { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { useMonitoringPending } from '@/hooks/useMonitoringPending';

export function MonitoringRefreshButton() {
  const { t } = useLanguage();
  const { tab, refreshActiveTab } = useMonitoringTab();
  const { clearPendingDataUpdate } = useMonitoringPending();
  const [refreshing, setRefreshing] = useState(false);

  const label =
    tab === 'operations' ? t('tabs.refreshOperations') : t('tabs.refreshAccount');

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshActiveTab();
      clearPendingDataUpdate();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refreshActiveTab, clearPendingDataUpdate]);

  return (
    <button
      type="button"
      className={cn('monitoring-refresh-btn', refreshing && 'monitoring-refresh-btn--spin')}
      onClick={() => void handleRefresh()}
      disabled={refreshing}
      title={label}
      aria-label={label}
    >
      <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
    </button>
  );
}
