import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SubHeader } from './SubHeader';
import { DashboardProviders } from '@/providers/DashboardProviders';
import { useLanguage } from '@/hooks/useLanguage';

const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'pages.groupMonitoring',
  '/admin': 'pages.admin',
};

export function DashboardLayout() {
  return (
    <DashboardProviders>
      <DashboardShell />
    </DashboardProviders>
  );
}

function DashboardShell() {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const titleKey = PAGE_TITLE_KEYS[pathname] ?? PAGE_TITLE_KEYS['/'];
  const title = t(titleKey);

  return (
    <div className="locale-switch-surface flex h-full overflow-hidden bg-bg-base">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} />
        <SubHeader />

        <main className="main-shell min-h-0 flex-1 overflow-hidden p-(--layout-gap)">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
