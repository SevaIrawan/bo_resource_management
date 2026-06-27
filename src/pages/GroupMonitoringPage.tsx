import { useState } from 'react';
import { AccountMonitoringBody } from '@/components/group-monitoring/AccountMonitoringBody';
import { OperationsMonitoringPanel } from '@/components/group-monitoring/OperationsMonitoringPanel';
import { ReportingMonitoringPanel } from '@/components/group-monitoring/ReportingMonitoringPanel';
import { ContentAreaCard } from '@/components/group-monitoring/ContentAreaCard';
import { KpiGrid } from '@/components/group-monitoring/KpiGrid';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { GroupMonitoringProvider } from '@/providers/GroupMonitoringProvider';
import type { AccountViewMode } from '@/types/accountMonitoringUi';

function GroupMonitoringContent() {
  const { tab } = useMonitoringTab();
  const { accountKpis } = useGroupMonitoring();
  const [accountViewMode, setAccountViewMode] = useState<AccountViewMode>('card');
  const [quickAddBrandNonce, setQuickAddBrandNonce] = useState(0);

  if (tab === 'reporting') {
    return (
      <div className="page-stack flex h-full min-h-0 flex-col gap-(--layout-gap)">
        <ReportingMonitoringPanel />
      </div>
    );
  }

  if (tab === 'operations') {
    return (
      <div className="page-stack flex h-full min-h-0 flex-col gap-(--layout-gap)">
        <OperationsMonitoringPanel />
      </div>
    );
  }

  return (
    <div className="page-stack flex h-full min-h-0 flex-col gap-(--layout-gap)">
      <KpiGrid items={accountKpis} />

      <ContentAreaCard
        accountViewMode={accountViewMode}
        onAccountViewModeChange={setAccountViewMode}
        onQuickAddBrand={() => setQuickAddBrandNonce((n) => n + 1)}
      >
        <AccountMonitoringBody
          viewMode={accountViewMode}
          quickAddBrandNonce={quickAddBrandNonce}
        />
      </ContentAreaCard>
    </div>
  );
}

export function GroupMonitoringPage() {
  return (
    <GroupMonitoringProvider>
      <GroupMonitoringContent />
    </GroupMonitoringProvider>
  );
}
