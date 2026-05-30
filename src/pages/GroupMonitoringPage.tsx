import { useState } from 'react';
import { AccountMonitoringBody } from '@/components/group-monitoring/AccountMonitoringBody';
import { TicketMonitoringBody } from '@/components/group-monitoring/TicketMonitoringBody';
import {
  ContentAreaCard,
} from '@/components/group-monitoring/ContentAreaCard';
import { KpiGrid } from '@/components/group-monitoring/KpiGrid';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { ACCOUNT_KPIS, TICKET_KPIS } from '@/config/groupMonitoringKpis';
import type { AccountViewMode } from '@/types/accountMonitoringUi';

export function GroupMonitoringPage() {
  const { tab } = useMonitoringTab();
  const [accountViewMode, setAccountViewMode] = useState<AccountViewMode>('card');

  return (
    <div className="page-stack flex h-full min-h-0 flex-col gap-(--layout-gap)">
      <KpiGrid items={tab === 'ticket' ? TICKET_KPIS : ACCOUNT_KPIS} />

      <ContentAreaCard
        tab={tab}
        accountViewMode={accountViewMode}
        onAccountViewModeChange={setAccountViewMode}
      >
        {tab === 'ticket' ? (
          <TicketMonitoringBody />
        ) : (
          <AccountMonitoringBody viewMode={accountViewMode} />
        )}
      </ContentAreaCard>
    </div>
  );
}
