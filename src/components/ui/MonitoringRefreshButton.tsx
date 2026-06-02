import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { hasAppUpdateNotice, useAppUpdateStatus } from '@/hooks/useAppUpdateStatus';

export function MonitoringRefreshButton() {
  const { t } = useLanguage();
  const { tab, refreshActiveTab } = useMonitoringTab();
  const updateStatus = useAppUpdateStatus();
  const [refreshing, setRefreshing] = useState(false);
  const showUpdateDot = hasAppUpdateNotice(updateStatus.status);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshActiveTab();
    } finally {
      setRefreshing(false);
    }
  }

  const label =
    tab === 'ticket' ? t('tabs.refreshTicket') : t('tabs.refreshAccount');
  const updateHint = showUpdateDot
    ? t('tabs.updateAvailable', { version: updateStatus.version ?? '?' })
    : undefined;

  return (
    <button
      type="button"
      className={cn(
        'monitoring-refresh-btn',
        refreshing && 'monitoring-refresh-btn--spin',
      )}
      onClick={() => void handleRefresh()}
      disabled={refreshing}
      title={updateHint ? `${label} · ${updateHint}` : label}
      aria-label={updateHint ? `${label}. ${updateHint}` : label}
    >
      <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
      {showUpdateDot ? (
        <span className="monitoring-refresh-update-dot" aria-hidden />
      ) : null}
    </button>
  );
}
