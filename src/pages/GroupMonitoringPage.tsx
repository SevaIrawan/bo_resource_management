import { MessageCircle, Plus, Ticket } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ContentAreaCard,
  ContentNestedPanel,
} from '@/components/group-monitoring/ContentAreaCard';
import { KpiGrid } from '@/components/group-monitoring/KpiGrid';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { useLanguage } from '@/hooks/useLanguage';
import { ACCOUNT_KPIS, TICKET_KPIS } from '@/config/groupMonitoringKpis';

export function GroupMonitoringPage() {
  const { tab } = useMonitoringTab();
  const { t } = useLanguage();

  return (
    <div className="page-stack flex h-full min-h-0 flex-col gap-(--layout-gap)">
      <KpiGrid items={tab === 'ticket' ? TICKET_KPIS : ACCOUNT_KPIS} />

      <ContentAreaCard tab={tab}>
        <ContentNestedPanel>
          {tab === 'ticket' ? (
            <EmptyState
              icon={<Ticket className="h-10 w-10" strokeWidth={1.25} />}
              title={t('groupMonitoring.noTickets')}
              description={t('groupMonitoring.noTicketsDesc')}
            />
          ) : (
            <EmptyState
              icon={<MessageCircle className="h-10 w-10" strokeWidth={1.25} />}
              title={t('groupMonitoring.noAccounts')}
              description={t('groupMonitoring.noAccountsDesc')}
              action={
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-hover px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/8"
                >
                  <Plus className="h-4 w-4" />
                  {t('groupMonitoring.addAccount')}
                </button>
              }
            />
          )}
        </ContentNestedPanel>
      </ContentAreaCard>
    </div>
  );
}
