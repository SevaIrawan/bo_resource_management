import { Download } from 'lucide-react';
import { TICKET_MOCK } from '@/config/ticketMonitoringMock';
import { TicketCardList } from '@/components/group-monitoring/TicketCard';
import { useLanguage } from '@/hooks/useLanguage';

export function TicketMonitoringBody() {
  const { t } = useLanguage();

  return (
    <div className="ticket-panel-shell">
      <TicketCardList tickets={TICKET_MOCK} />

      <footer className="ticket-panel-footer">
        <button type="button" className="brand-card-export-btn">
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          {t('groupMonitoring.ticketPanel.exportCsv')}
        </button>
      </footer>
    </div>
  );
}
