import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n';
import { useLanguage } from '@/hooks/useLanguage';

const OPTIONS: { id: Locale; label: string }[] = [
  { id: 'zh', label: 'CH' },
  { id: 'en', label: 'EN' },
];

interface LanguageToggleProps {
  value: Locale;
  onChange: (locale: Locale) => void;
  /** `header` = compact segmented control for top bar */
  variant?: 'default' | 'header';
}

export function LanguageToggle({
  value,
  onChange,
  variant = 'default',
}: LanguageToggleProps) {
  const { t, isLocaleSwitching } = useLanguage();
  const isHeader = variant === 'header';
  const activeIndex = Math.max(
    0,
    OPTIONS.findIndex((option) => option.id === value),
  );

  if (isHeader) {
    return (
      <div
        className="locale-toggle locale-toggle--header"
        role="group"
        aria-label={t('header.languageToggle')}
      >
        <span
          className="locale-toggle-pill"
          aria-hidden
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={isLocaleSwitching}
            onClick={() => onChange(id)}
            aria-pressed={value === id}
            className={cn(
              'locale-toggle-btn locale-toggle-btn--header',
              value === id && 'locale-toggle-btn--header-active',
              isLocaleSwitching && 'locale-toggle-btn--disabled',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="locale-toggle inline-flex rounded-lg bg-bg-base p-1"
      role="group"
      aria-label={t('header.languageToggle')}
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
