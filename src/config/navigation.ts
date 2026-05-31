export const APP_NAME = 'Resource Management';
export const APP_BRAND = 'Backend Operation';
export const APP_TAGLINE = 'Resource Management';

/** Sidebar dimulai collapsed (icon-only). */
export const SIDEBAR_DEFAULT_COLLAPSED = true;

/** Legacy path — redirects to Admin in router. */
export const SETTINGS_PATH = '/settings';

export const NAV_ITEMS = [
  {
    id: 'group-monitoring',
    path: '/',
    icon: 'monitor' as const,
    end: true as const,
  },
  {
    id: 'admin',
    path: '/admin',
    icon: 'admin' as const,
    end: false as const,
  },
] as const;

export type NavItemId = (typeof NAV_ITEMS)[number]['id'];
