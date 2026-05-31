import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  LOCALE_STORAGE_KEY,
  translate,
  type Locale,
} from '@/i18n';
import { runLocaleSwitch } from '@/lib/localeSwitch';
import { LanguageContext } from '@/contexts/language-context';

function readStoredLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === 'zh' || stored === 'en' ? stored : 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());
  const [isLocaleSwitching, setIsLocaleSwitching] = useState(false);
  const switchingRef = useRef(false);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale || switchingRef.current) return;

      switchingRef.current = true;
      setIsLocaleSwitching(true);

      void runLocaleSwitch(() => {
        setLocaleState(next);
        localStorage.setItem(LOCALE_STORAGE_KEY, next);
      }).finally(() => {
        switchingRef.current = false;
        setIsLocaleSwitching(false);
      });
    },
    [locale],
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, isLocaleSwitching }),
    [locale, setLocale, t, isLocaleSwitching],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}
