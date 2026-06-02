import { NavLink, useNavigate } from 'react-router-dom';
import { Power } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/hooks/useSidebar';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useLanguage } from '@/hooks/useLanguage';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { SidebarLabel } from '@/components/layout/SidebarLabel';
import { NAV_ITEMS } from '@/config/navigation';
import { IconAdmin, IconGroupMonitoring } from '@/components/icons/NavIcons';

const ICONS = {
  monitor: IconGroupMonitoring,
  admin: IconAdmin,
} as const;

const NAV_LABEL_KEYS: Record<(typeof NAV_ITEMS)[number]['id'], string> = {
  'group-monitoring': 'nav.groupMonitoring',
  admin: 'nav.admin',
};

export function Sidebar() {
  const { collapsed } = useSidebar();
  const { t } = useLanguage();
  const { logout } = useAuth();
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();

  const navItems = isAdmin ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.id !== 'admin');

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'sidebar-shell sticky top-0 flex h-full shrink-0 flex-col border-r border-border-subtle bg-bg-shell',
        collapsed ? 'w-(--sidebar-collapsed-width)' : 'w-(--sidebar-expanded-width)',
      )}
    >
      <div className="flex h-(--header-height) shrink-0 items-center border-b border-border-subtle px-3 py-0">
        <BrandLogo collapsed={collapsed} className="w-full" />
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2 pt-3">
        {navItems.map(({ id, path, icon, end }) => {
          const Icon = ICONS[icon];
          const label = t(NAV_LABEL_KEYS[id]);
          return (
            <NavLink
              key={id}
              to={path}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'nav-item flex h-10 items-center rounded-xl px-3 transition-colors duration-200',
                  isActive ? 'nav-item-active' : 'text-text-muted',
                )
              }
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <Icon className="h-5 w-5" />
              </span>
              <SidebarLabel collapsed={collapsed}>{label}</SidebarLabel>
            </NavLink>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border-subtle p-2">
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? t('nav.logout') : undefined}
          aria-label={t('nav.logout')}
          className="nav-item flex h-10 w-full items-center rounded-xl px-3 text-text-muted transition-colors duration-200 hover:bg-white/6 hover:text-danger"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <Power className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <SidebarLabel collapsed={collapsed}>{t('nav.logout')}</SidebarLabel>
        </button>
      </div>
    </aside>
  );
}
