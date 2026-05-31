import { AutoSyncSettingsSection } from '@/components/settings/AutoSyncSettingsSection';
import { LanguageToggle } from '@/components/settings/LanguageToggle';
import { useLanguage } from '@/hooks/useLanguage';

export function SettingsPage() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-card">
      <div className="border-b border-border-subtle px-6 py-4">
        <h2 className="text-sm font-medium text-text-primary">{t('settings.title')}</h2>
        <p className="mt-0.5 text-xs text-text-muted">{t('settings.subtitle')}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        <AutoSyncSettingsSection />

        <section className="max-w-lg rounded-xl border border-border-subtle bg-bg-shell p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-text-primary">
                {t('settings.language')}
              </h3>
              <p className="mt-1 text-xs text-text-muted">{t('settings.languageDesc')}</p>
            </div>
            <LanguageToggle value={locale} onChange={setLocale} />
          </div>
        </section>
      </div>
    </div>
  );
}
