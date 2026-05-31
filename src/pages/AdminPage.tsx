import { Database, KeyRound, Server, Shield } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase';
import { RM_ACTIVE_TABLES } from '@/config/tables';
import { useLanguage } from '@/hooks/useLanguage';

export function AdminPage() {
  const { t } = useLanguage();
  const supabaseReady = isSupabaseConfigured();

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

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
      <div className="border-b border-border-subtle px-6 py-4">
        <h2 className="text-sm font-medium text-text-primary">{t('admin.title')}</h2>
        <p className="mt-0.5 text-xs text-text-muted">{t('admin.subtitle')}</p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-3 sm:grid-cols-2">
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
      </div>
    </div>
  );
}
