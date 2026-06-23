import { useLocation } from 'react-router-dom';
import { MonitoringTabs } from '@/components/ui/MonitoringTabs';
import { MonitoringRefreshButton } from '@/components/ui/MonitoringRefreshButton';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';

function GroupMonitoringSubHeader() {
  const { tab, setTab } = useMonitoringTab();

  return (
    <div className="sticky top-(--header-height) z-20 flex h-(--subheader-height) shrink-0 items-center justify-end border-b border-border-subtle bg-bg-base px-6">
      <div className="monitoring-subheader-actions">
        <MonitoringTabs value={tab} onChange={setTab} />
        <MonitoringRefreshButton />
      </div>
    </div>
  );
}

export function SubHeader() {
  const { pathname } = useLocation();

  if (pathname !== '/') {
    return null;
  }

  return <GroupMonitoringSubHeader />;
}
