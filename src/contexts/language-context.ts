import { createContext } from 'react';
import type { Locale } from '@/i18n';

export interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLocaleSwitching: boolean;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);
