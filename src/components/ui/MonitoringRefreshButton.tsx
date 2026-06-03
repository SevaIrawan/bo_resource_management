import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { useMonitoringPending } from '@/hooks/useMonitoringPending';
import { hasAppUpdateNotice, useAppUpdateStatus } from '@/hooks/useAppUpdateStatus';
import { APP_VERSION } from '@/lib/appVersion';
import { appUpdateStatusLine } from '@/lib/appUpdateUi';

export function MonitoringRefreshButton() {
  const { t } = useLanguage();
  const { tab, refreshActiveTab, refreshAllMonitoring } = useMonitoringTab();
  const { hasPendingDataUpdate, clearPendingDataUpdate } = useMonitoringPending();
  const updateStatus = useAppUpdateStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const hasAppUpdate = hasAppUpdateNotice(updateStatus.status);
  const showMenu = hasAppUpdate || hasPendingDataUpdate;
  const installedVersion = updateStatus.currentVersion || APP_VERSION;
  const newVersion = updateStatus.version;
  const appUpdateLine = appUpdateStatusLine(t, updateStatus.status, newVersion);

  const label =
    tab === 'ticket' ? t('tabs.refreshTicket') : t('tabs.refreshAccount');

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen, closeMenu]);

  const finishRefresh = useCallback(async (full: boolean) => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (full) {
        await refreshAllMonitoring();
      } else {
        await refreshActiveTab();
      }
      clearPendingDataUpdate();
    } finally {
      setRefreshing(false);
      closeMenu();
    }
  }, [
    refreshing,
    refreshActiveTab,
    refreshAllMonitoring,
    clearPendingDataUpdate,
    closeMenu,
  ]);

  const handleUpdateNow = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (updateStatus.status === 'downloaded') {
        await window.electronAPI?.app?.installUpdate?.();
        return;
      }
      if (updateStatus.status === 'available') {
        await window.electronAPI?.app?.checkForUpdates?.();
      }
      await refreshAllMonitoring();
      clearPendingDataUpdate();
    } finally {
      setRefreshing(false);
      closeMenu();
    }
  }, [refreshing, updateStatus.status, refreshAllMonitoring, clearPendingDataUpdate, closeMenu]);

  const handleSimpleRefresh = () => {
    if (showMenu) {
      setMenuOpen((open) => !open);
      return;
    }
    void finishRefresh(false);
  };

  const updateHintParts: string[] = [];
  if (hasAppUpdate && newVersion) {
    updateHintParts.push(
      t('tabs.updateAvailableDetail', {
        current: installedVersion,
        version: newVersion,
      }),
    );
  } else if (hasPendingDataUpdate) {
    updateHintParts.push(t('tabs.dataUpdatesPending'));
  }
  const updateHint = updateHintParts.length ? updateHintParts.join(' · ') : undefined;

  const updateNowLabel =
    hasAppUpdate && newVersion
      ? t('tabs.updateNowToVersion', { version: newVersion })
      : t('tabs.updateNow');

  return (
    <div ref={rootRef} className="monitoring-refresh-wrap">
      <button
        type="button"
        className={cn(
          'monitoring-refresh-btn',
          refreshing && 'monitoring-refresh-btn--spin',
          showMenu && 'monitoring-refresh-btn--has-menu',
        )}
        onClick={() => void handleSimpleRefresh()}
        disabled={refreshing}
        title={updateHint ? `${label} · ${updateHint}` : label}
        aria-label={updateHint ? `${label}. ${updateHint}` : label}
        aria-expanded={showMenu ? menuOpen : undefined}
        aria-haspopup={showMenu ? 'menu' : undefined}
      >
        <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
        {showMenu ? (
          <ChevronDown
            className={cn('monitoring-refresh-chevron', menuOpen && 'monitoring-refresh-chevron--open')}
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
        {showMenu ? (
          <span className="monitoring-refresh-update-dot" aria-hidden />
        ) : null}
      </button>

      {showMenu && menuOpen ? (
        <div className="monitoring-refresh-menu" role="menu">
          {hasAppUpdate && newVersion ? (
            <div className="monitoring-refresh-menu__caption" role="presentation">
              <p>{t('tabs.currentAppVersion', { version: installedVersion })}</p>
              <p className="monitoring-refresh-menu__caption-new">
                {t('tabs.updateToVersion', { version: newVersion })}
              </p>
              {appUpdateLine ? (
                <p className="monitoring-refresh-menu__caption-status">{appUpdateLine}</p>
              ) : null}
            </div>
          ) : hasPendingDataUpdate ? (
            <div className="monitoring-refresh-menu__caption" role="presentation">
              <p>{t('tabs.dataUpdatesPending')}</p>
            </div>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="monitoring-refresh-menu__item monitoring-refresh-menu__item--primary"
            disabled={refreshing}
            onClick={() => void handleUpdateNow()}
          >
            {updateNowLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className="monitoring-refresh-menu__item"
            disabled={refreshing}
            onClick={() => void finishRefresh(false)}
          >
            {t('tabs.refreshMenu')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
