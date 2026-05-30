import { useLocation } from 'react-router-dom';
import { MonitoringTabs } from '@/components/ui/MonitoringTabs';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { useLanguage } from '@/hooks/useLanguage';
import { SETTINGS_PATH } from '@/config/navigation';

function SettingsSubHeader() {
  const { t } = useLanguage();

  return (
    <div className="sticky top-(--header-height) z-20 flex h-(--subheader-height) shrink-0 items-center border-b border-border-subtle bg-bg-base px-6">
        <p className="text-xs text-text-muted">{t('subheader.settingsDesc')}</p>
    </div>
  );
}

function AdminSubHeader() {
  const { t } = useLanguage();

  return (
    <div className="sticky top-(--header-height) z-20 flex h-(--subheader-height) shrink-0 items-center border-b border-border-subtle bg-bg-base px-6">
      <p className="text-xs text-text-muted">{t('subheader.adminDesc')}</p>
    </div>
  );
}

function GroupMonitoringSubHeader() {
  const { tab, setTab, ticketCount } = useMonitoringTab();

  return (
    <div className="sticky top-(--header-height) z-20 flex h-(--subheader-height) shrink-0 items-center justify-end border-b border-border-subtle bg-bg-base px-6">
      <MonitoringTabs value={tab} onChange={setTab} ticketCount={ticketCount} />
    </div>
  );
}

export function SubHeader() {
  const { pathname } = useLocation();

  if (pathname === SETTINGS_PATH) {
    return <SettingsSubHeader />;
  }

  if (pathname !== '/') {
    return <AdminSubHeader />;
  }

  return <GroupMonitoringSubHeader />;
}
