import { useState } from 'react';
import { Database, KeyRound, Server, Shield } from 'lucide-react';
import { AdminExpandCard } from '@/components/admin/AdminExpandCard';
import { AutoSyncSettingsSection } from '@/components/settings/AutoSyncSettingsSection';
import { LanguageToggle } from '@/components/settings/LanguageToggle';
import { useAutoSyncSettings } from '@/contexts/AutoSyncSettingsContext';
import { RM_ACTIVE_TABLES } from '@/config/tables';
import { useAppUpdateStatus } from '@/hooks/useAppUpdateStatus';
import { useLanguage } from '@/hooks/useLanguage';
import { APP_VERSION } from '@/lib/appVersion';
import { appUpdateStatusLine, hasNewerAppVersion } from '@/lib/appUpdateUi';
import { isSupabaseConfigured } from '@/lib/supabase';

export function AdminPage() {
  const { locale, setLocale, t } = useLanguage();
  const supabaseReady = isSupabaseConfigured();
  const { enabled, intervalMinutes } = useAutoSyncSettings();
  const updateStatus = useAppUpdateStatus();
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const installedVersion = updateStatus.currentVersion || APP_VERSION;
  const newVersion = updateStatus.version;
  const updateLine = appUpdateStatusLine(
    t,
    updateStatus.status,
    newVersion,
    updateStatus.percent,
    updateStatus.errorMessage,
  );

  const items = [
    {
      id: 'supabase',
      icon: Database,
      labelKey: 'admin.supabase',
      value: supabaseReady ? t('admin.connected') : t('admin.notConfigured'),
      ok: supabaseReady,
    },
    {
      id: 'sessions',
      icon: KeyRound,
      labelKey: 'admin.activeSessions',
      value: '0',
      ok: false,
    },
    {
      id: 'platform',
      icon: Server,
      labelKey: 'admin.platform',
      value: window.electronAPI?.isElectron ? t('admin.desktop') : t('admin.web'),
      ok: true,
    },
    {
      id: 'tables',
      icon: Shield,
      labelKey: 'admin.sessionTables',
      value: `${RM_ACTIVE_TABLES.length} RM tables`,
      ok: true,
    },
  ] as const;

  const autoSyncSummary = enabled
    ? t('admin.autoSyncSummaryOn', { minutes: intervalMinutes })
    : t('admin.autoSyncSummaryOff');

  const languageSummary = locale === 'zh' ? 'ZH' : 'ENG';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
      <div className="border-b border-border-subtle px-6 py-4">
        <h2 className="text-sm font-medium text-text-primary">{t('admin.title')}</h2>
        <p className="mt-0.5 text-xs text-text-muted">{t('admin.subtitle')}</p>
      </div>

      <div className="flex-1 space-y-8 overflow-auto p-6">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t('admin.systemSection')}
          </h3>
          <div className="admin-page-grid mt-3">
            {items.map(({ id, icon: Icon, labelKey, value, ok }) => (
              <div
                key={id}
                className="flex items-center gap-4 rounded-xl border border-border-subtle bg-bg-shell px-5 py-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-active">
                  <Icon className="h-5 w-5 text-text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-text-muted">{t(labelKey)}</p>
                  <p
                    className={`truncate text-sm font-medium ${ok ? 'text-text-primary' : 'text-text-secondary'}`}
                  >
                    {value}
                  </p>
                </div>
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-wa' : 'bg-text-muted'}`}
                />
              </div>
            ))}
          </div>
        </section>

        {window.electronAPI?.app?.openConfigFolder ? (
          <section className="space-y-4">
            <div>
              <button
                type="button"
                className="rounded-lg border border-border-subtle bg-bg-shell px-4 py-2 text-xs font-medium text-text-primary hover:bg-bg-active"
                onClick={() => void window.electronAPI?.app?.openConfigFolder()}
              >
                {t('admin.openConfigFolder')}
              </button>
              <p className="mt-2 text-xs text-text-muted">{t('admin.configFolderHint')}</p>
            </div>
            {window.electronAPI.app.checkForUpdates ? (
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
          </section>
        ) : null}

        <section className="border-t border-border-subtle pt-8">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t('admin.preferencesSection')}
          </h3>

          <div className="admin-page-grid mt-3">
            <AdminExpandCard
              title={t('settings.autoSync.title')}
              summary={autoSyncSummary}
            >
              <AutoSyncSettingsSection />
            </AdminExpandCard>

            <AdminExpandCard
              title={t('settings.language')}
              summary={languageSummary}
            >
              <p className="text-xs leading-relaxed text-text-muted">
                {t('settings.languageDesc')}
              </p>
              <LanguageToggle value={locale} onChange={setLocale} />
            </AdminExpandCard>
          </div>
        </section>
      </div>
    </div>
  );
}
