import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n';
import { useLanguage } from '@/hooks/useLanguage';

const OPTIONS: { id: Locale; label: string }[] = [
  { id: 'zh', label: 'ZH' },
  { id: 'en', label: 'ENG' },
];

interface LanguageToggleProps {
  value: Locale;
  onChange: (locale: Locale) => void;
}

export function LanguageToggle({ value, onChange }: LanguageToggleProps) {
  const { t, isLocaleSwitching } = useLanguage();

  return (
    <div
      className="locale-toggle inline-flex rounded-lg bg-bg-base p-1"
      role="group"
      aria-label={t('settings.language')}
    >
      {OPTIONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          disabled={isLocaleSwitching}
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={cn(
            'locale-toggle-btn rounded-md px-4 py-2 text-sm font-medium transition-colors',
            isLocaleSwitching && 'opacity-60 pointer-events-none',
            value === id
              ? 'bg-bg-shell text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
