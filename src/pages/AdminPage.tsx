import { useState } from 'react';
import { Database, KeyRound, Server, Shield } from 'lucide-react';
import { AdminExpandCard } from '@/components/admin/AdminExpandCard';
import { AutoSyncSettingsSection } from '@/components/settings/AutoSyncSettingsSection';
import { LanguageToggle } from '@/components/settings/LanguageToggle';
import { useAutoSyncSettings } from '@/contexts/AutoSyncSettingsContext';
import { RM_ACTIVE_TABLES } from '@/config/tables';
import { useLanguage } from '@/hooks/useLanguage';
import { isSupabaseConfigured } from '@/lib/supabase';

export function AdminPage() {
  const { locale, setLocale, t } = useLanguage();
  const supabaseReady = isSupabaseConfigured();
  const { enabled, intervalMinutes } = useAutoSyncSettings();
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

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
          <section className="space-y-3">
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
              <div>
                <button
                  type="button"
                  className="rounded-lg border border-border-subtle bg-bg-shell px-4 py-2 text-xs font-medium text-text-primary hover:bg-bg-active"
                  onClick={() => {
                    setUpdateMsg(null);
                    void window.electronAPI?.app?.checkForUpdates?.().then((r) => {
                      setUpdateMsg(r.message ?? r.status);
                    });
                  }}
                >
                  {t('admin.checkForUpdates')}
                </button>
                <p className="mt-2 text-xs text-text-muted">{t('admin.autoUpdateHint')}</p>
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
