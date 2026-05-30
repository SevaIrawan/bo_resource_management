import { en } from './locales/en';
import { zh } from './locales/zh';

export type Locale = 'en' | 'zh';

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
];

export const messages = { en, zh } as const;

export type MessageKey = keyof typeof en;

export const LOCALE_STORAGE_KEY = 'rm-locale';

function getByPath(obj: Record<string, unknown>, path: string): string {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);

  return typeof value === 'string' ? value : path;
}

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  let text = getByPath(messages[locale] as unknown as Record<string, unknown>, key);

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), String(value));
    }
  }

  return text;
}
