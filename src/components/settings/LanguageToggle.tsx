import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n';
import { useLanguage } from '@/hooks/useLanguage';

interface LanguageToggleProps {
  value: Locale;
  onChange: (locale: Locale) => void;
}

const OPTIONS: Locale[] = ['zh', 'en'];

export function LanguageToggle({ value, onChange }: LanguageToggleProps) {
  const { t } = useLanguage();

  return (
    <div className="inline-flex rounded-lg bg-bg-base p-1">
      {OPTIONS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'rounded-md px-4 py-2 text-sm font-medium transition-colors',
            value === id
              ? 'bg-bg-shell text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          {t(`settings.${id}`)}
        </button>
      ))}
    </div>
  );
}
