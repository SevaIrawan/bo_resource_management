import { useState } from 'react';
import { Download } from 'lucide-react';
import { TicketCardList } from '@/components/group-monitoring/TicketCard';
import { TicketIssueDetailModal } from '@/components/group-monitoring/TicketIssueDetailModal';
import type { TicketSummaryGroup } from '@/lib/ticketGroups';
import { exportAllTicketGroupsExcel } from '@/lib/exportExcel';
import { ticketNoteForDisplay } from '@/lib/ticketNote';
import { ticketTypeLabel } from '@/lib/ticketTypeLabel';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';

export function TicketMonitoringBody() {
  const { t } = useLanguage();
  const { filteredTicketSummaries, ticketSummaries, loading } = useGroupMonitoring();
  const [detailGroup, setDetailGroup] = useState<TicketSummaryGroup | null>(null);

  if (loading) {
    return <p className="account-sync-loading">{t('groupMonitoring.loadingAccounts')}</p>;
  }

  const detailTotal = filteredTicketSummaries.reduce((n, g) => n + g.itemCount, 0);
  const hasAnyTickets = ticketSummaries.length > 0;
  const hasFiltered = filteredTicketSummaries.length > 0;

  return (
    <div className="ticket-panel-shell">
      {hasFiltered ? (
        <>
          <p className="ticket-panel-summary">
            {t('groupMonitoring.ticketPanel.summaryGrouped', {
              issues: filteredTicketSummaries.length,
              rows: detailTotal,
            })}
            {filteredTicketSummaries.length !== ticketSummaries.length ? (
              <>
                {' · '}
                {t('groupMonitoring.ticketPanel.summaryFiltered', {
                  total: ticketSummaries.length,
                })}
              </>
            ) : null}
          </p>
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
          <p className="ticket-empty-title">
            {hasAnyTickets
              ? t('groupMonitoring.ticketPanel.noFilterMatch')
              : t('groupMonitoring.noTickets')}
          </p>
          <p className="ticket-empty-desc">
            {hasAnyTickets
              ? t('groupMonitoring.ticketPanel.noFilterMatchDesc')
              : t('groupMonitoring.noTicketsDesc')}
          </p>
        </div>
      )}

      <footer className="ticket-panel-footer">
        <button
          type="button"
          className="brand-card-export-btn"
          disabled={filteredTicketSummaries.length === 0}
          onClick={() =>
            exportAllTicketGroupsExcel(
              filteredTicketSummaries,
              (group) => ticketTypeLabel(t, group.ticketType, 'export'),
              (group, line) =>
                ticketNoteForDisplay(t, group.ticketType, line.description, line),
            )
          }
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          {t('groupMonitoring.ticketPanel.exportAll')}
        </button>
      </footer>
    </div>
  );
}
