import { useState } from 'react';
import { TicketCardList } from '@/components/group-monitoring/TicketCard';
import { TicketIssueDetailModal } from '@/components/group-monitoring/TicketIssueDetailModal';
import type { TicketSummaryGroup } from '@/lib/ticketGroups';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';

export function TicketMonitoringBody() {
  const { t } = useLanguage();
  const { filteredTicketSummaries, ticketSummaries, loading, ticketFilters } =
    useGroupMonitoring();
  const [detailGroup, setDetailGroup] = useState<TicketSummaryGroup | null>(null);

  if (loading) {
    return <p className="account-sync-loading">{t('groupMonitoring.loadingAccounts')}</p>;
  }

  const hasAnyTickets = ticketSummaries.length > 0;
  const hasFiltered = filteredTicketSummaries.length > 0;
  const activeBookmark = ticketFilters.workflowBookmark;

  const emptyTitle = hasAnyTickets
    ? t('groupMonitoring.ticketPanel.noFilterMatch')
    : t('groupMonitoring.noTickets');

  const emptyDesc = (() => {
    if (!hasAnyTickets) return t('groupMonitoring.noTicketsDesc');
    if (activeBookmark === 'in_progress') {
      return t('groupMonitoring.ticketPanel.bookmarkEmptyInProgress');
    }
    if (activeBookmark === 'completed') {
      return t('groupMonitoring.ticketPanel.bookmarkEmptyCompleted');
    }
    return t('groupMonitoring.ticketPanel.noFilterMatchDesc');
  })();

  return (
    <div className="ticket-monitoring-body">
      {hasFiltered ? (
        <>
          <TicketCardList
            groups={filteredTicketSummaries}
            onOpenDetail={setDetailGroup}
          />
          <TicketIssueDetailModal
            group={detailGroup}
            onClose={() => setDetailGroup(null)}
          />
        </>
      ) : (
        <div className="ticket-card-list ticket-card-list--empty">
          <p className="ticket-empty-title">{emptyTitle}</p>
          <p className="ticket-empty-desc">{emptyDesc}</p>
        </div>
      )}
    </div>
  );
}
