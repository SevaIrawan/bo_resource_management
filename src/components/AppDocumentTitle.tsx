import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';

const TITLE_KEYS: Record<string, string> = {
  '/': 'pages.groupMonitoring',
  '/admin': 'pages.admin',
  '/settings': 'pages.settings',
  '/login': 'brand.name',
};

export function AppDocumentTitle() {
  const { pathname } = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    const key = TITLE_KEYS[pathname] ?? TITLE_KEYS['/'];
    document.title = t(key);
  }, [pathname, t]);

  return null;
}
