import { useEffect, useState } from 'react';
import { AdminExpandCard, AdminExpandCardGroup } from '@/components/admin/AdminExpandCard';
import { AdminKpiGrid, type AdminKpiItem } from '@/components/admin/AdminKpiGrid';
import {
  OperationsStockBrandPolicyCard,
  OperationsStockSopNamingCard,
} from '@/components/admin/OperationsStockPolicySection';
import {
  WorkerTelegramSettingsCard,
  WorkerWhatsAppSettingsCard,
} from '@/components/admin/WorkerPlatformSettingsSection';
import { AutoSyncSettingsSection } from '@/components/settings/AutoSyncSettingsSection';
import { LanguageToggle } from '@/components/settings/LanguageToggle';
import { formatScheduledHourAmPm } from '@/config/autoScrapeSchedule';
import { useAutoSyncSettings } from '@/contexts/AutoSyncSettingsContext';
import { RM_ACTIVE_TABLES } from '@/config/tables';
import { useAppUpdateStatus } from '@/hooks/useAppUpdateStatus';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { APP_VERSION } from '@/lib/appVersion';
import { appUpdateStatusLine, hasNewerAppVersion } from '@/lib/appUpdateUi';
import { countActiveMessagingSessionsForUser } from '@/lib/platformSessions';
import { isSupabaseConfigured } from '@/lib/supabase';

export function SettingsPage() {
  const { user } = useAuth();
  const { locale, setLocale, t } = useLanguage();
  const supabaseReady = isSupabaseConfigured();
  const { enabled, scheduledHour } = useAutoSyncSettings();
  const updateStatus = useAppUpdateStatus();
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [activeSessionCount, setActiveSessionCount] = useState<number | null>(null);

  useEffect(() => {
    if (!supabaseReady || !user?.id) {
      setActiveSessionCount(null);
      return;
    }

    let cancelled = false;
    void countActiveMessagingSessionsForUser(user.id).then((count) => {
      if (!cancelled) setActiveSessionCount(count);
    });

    return () => {
      cancelled = true;
    };
  }, [supabaseReady, user?.id]);

  const installedVersion = updateStatus.currentVersion || APP_VERSION;
  const newVersion = updateStatus.version;
  const updateLine = appUpdateStatusLine(
    t,
    updateStatus.status,
    newVersion,
    updateStatus.percent,
    updateStatus.errorMessage,
  );

  const kpiItems: AdminKpiItem[] = [
    {
      id: 'supabase',
      labelKey: 'admin.supabase',
      value: supabaseReady ? t('admin.connected') : t('admin.notConfigured'),
      tone: supabaseReady ? 'success' : 'warning',
    },
    {
      id: 'sessions',
      labelKey: 'admin.activeSessions',
      value:
        activeSessionCount === null ? t('admin.sessionsLoading') : activeSessionCount,
      tone: 'default',
    },
    {
      id: 'platform',
      labelKey: 'admin.platform',
      value: window.electronAPI?.isElectron ? t('admin.desktop') : t('admin.web'),
      tone: 'success',
    },
    {
      id: 'tables',
      labelKey: 'admin.sessionTables',
      value: RM_ACTIVE_TABLES.length,
      tone: 'success',
    },
  ];

  const autoSyncSummary = enabled
    ? t('admin.autoSyncSummaryOn', {
        time: formatScheduledHourAmPm(scheduledHour),
      })
    : t('admin.autoSyncSummaryOff');

  const languageSummary = t(`settings.${locale}`);

  return (
    <div className="page-stack flex h-full min-h-0 flex-col gap-(--layout-gap)">
      <AdminKpiGrid items={kpiItems} />

      <section className="content-area-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
        <div className="content-area-body flex min-h-0 flex-1 flex-col overflow-auto p-6">
          <div className="flex min-h-0 flex-1 flex-col gap-8">
            {window.electronAPI?.app?.checkForUpdates ? (
              <div className="rounded-xl border border-border-subtle bg-bg-shell px-4 py-4">
                <p className="text-sm font-medium text-text-primary">
                  {t('admin.currentVersion', { version: installedVersion })}
                </p>
                {hasNewerAppVersion(updateStatus.status) && newVersion ? (
                  <p className="mt-1 text-sm font-medium text-wa">
                    {t('admin.latestVersion', { version: newVersion })}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-text-muted">{t('admin.noUpdateAvailable')}</p>
                )}
                {updateLine ? (
                  <p className="mt-2 text-xs text-text-secondary">{updateLine}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-border-subtle bg-bg-active px-4 py-2 text-xs font-medium text-text-primary hover:border-border"
                    disabled={checkingUpdate}
                    onClick={() => {
                      setUpdateMsg(null);
                      setCheckingUpdate(true);
                      void window.electronAPI?.app?.checkForUpdates?.().then((r) => {
                        setUpdateMsg(r.message ?? r.status);
                      }).finally(() => setCheckingUpdate(false));
                    }}
                  >
                    {checkingUpdate
                      ? t('admin.checkingUpdates')
                      : t('admin.checkForUpdates')}
                  </button>
                  {updateStatus.status === 'downloaded' && newVersion ? (
                    <button
                      type="button"
                      className="rounded-lg border border-wa/40 bg-wa/10 px-4 py-2 text-xs font-semibold text-wa hover:bg-wa/15"
                      onClick={() => void window.electronAPI?.app?.installUpdate?.()}
                    >
                      {t('admin.installUpdateNow', { version: newVersion })}
                    </button>
                  ) : null}
                </div>
                {updateMsg ? (
                  <p className="mt-1 text-xs text-text-secondary">{updateMsg}</p>
                ) : null}
              </div>
            ) : null}

            <AdminExpandCardGroup>
              <div className="admin-page-grid">
                <AdminExpandCard
                  cardId="auto-sync"
                  title={t('settings.autoSync.title')}
                  summary={autoSyncSummary}
                >
                  <AutoSyncSettingsSection />
                </AdminExpandCard>

                <AdminExpandCard
                  cardId="language"
                  title={t('settings.language')}
                  summary={languageSummary}
                >
                  <p className="text-xs leading-relaxed text-text-muted">
                    {t('settings.languageDesc')}
                  </p>
                  <LanguageToggle value={locale} onChange={setLocale} />
                </AdminExpandCard>

                <OperationsStockBrandPolicyCard />

                <OperationsStockSopNamingCard />

                <WorkerWhatsAppSettingsCard />

                <WorkerTelegramSettingsCard />
              </div>
            </AdminExpandCardGroup>
          </div>
        </div>
      </section>
    </div>
  );
}
