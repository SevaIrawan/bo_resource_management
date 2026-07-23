import { useState } from 'react';
import { AccountMonitoringBody } from '@/components/group-monitoring/AccountMonitoringBody';
import { OperationsMonitoringPanel } from '@/components/group-monitoring/OperationsMonitoringPanel';
import { ContentAreaCard } from '@/components/group-monitoring/ContentAreaCard';
import { KpiGrid } from '@/components/group-monitoring/KpiGrid';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import type { AccountViewMode } from '@/types/accountMonitoringUi';

function GroupMonitoringContent() {
  const { tab } = useMonitoringTab();
  const {
    accountKpis,
    loadError,
    loading,
    groups,
    filteredGroups,
    accountFilters,
    setAccountFilters,
  } = useGroupMonitoring();
  const [accountViewMode, setAccountViewMode] = useState<AccountViewMode>('card');
  const [addBrandModalOpen, setAddBrandModalOpen] = useState(false);

  if (loadError && !loading) {
    return <p className="account-sync-loading">{loadError}</p>;
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
        onOpenAddBrand={() => setAddBrandModalOpen(true)}
        groups={groups}
        filteredGroups={filteredGroups}
        accountFilters={accountFilters}
        setAccountFilters={setAccountFilters}
      >
        <AccountMonitoringBody
          viewMode={accountViewMode}
          addBrandModalOpen={addBrandModalOpen}
          onAddBrandModalOpenChange={setAddBrandModalOpen}
        />
      </ContentAreaCard>
    </div>
  );
}

export function GroupMonitoringPage() {
  return <GroupMonitoringContent />;
}
