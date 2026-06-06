import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { exportTicketGroupExcel } from '@/lib/exportExcel';
import {
  TICKET_DETAIL_MODAL_COLUMNS,
  ticketGroupToExportRows,
  type TicketExportRow,
} from '@/lib/ticketExportRows';
import type { TicketSummaryGroup } from '@/lib/ticketGroups';
import { ticketTypeLabel } from '@/lib/ticketTypeLabel';
import { useLanguage } from '@/hooks/useLanguage';

interface TicketIssueDetailModalProps {
  group: TicketSummaryGroup | null;
  onClose: () => void;
}

export function TicketIssueDetailModal({ group, onClose }: TicketIssueDetailModalProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!group) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [group, onClose]);

  if (!group) return null;

  const typeLabel = ticketTypeLabel(t, group.ticketType, 'badge');
  const rows = ticketGroupToExportRows(group, typeLabel);

  return (
    <BrandModalRoot onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--ticket-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header ticket-detail-modal-header">
          <div>
            <h2 id="ticket-detail-title" className="ticket-detail-modal-title">
              {group.accountName} · {typeLabel}
            </h2>
            <p className="ticket-detail-modal-meta">
              {group.phoneNumber} · {group.brandName} ·{' '}
              {group.platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} ·{' '}
              {t('groupMonitoring.ticketPanel.detailRowCount', { count: rows.length })}
            </p>
          </div>
          <button
            type="button"
            className="brand-modal-close"
            onClick={onClose}
            aria-label={t('groupMonitoring.ticketPanel.closeDetail')}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="ticket-detail-table-wrap">
          <table className="ticket-detail-table">
            <thead>
              <tr>
                {TICKET_DETAIL_MODAL_COLUMNS.map((col) => (
                  <th key={col}>{t(`groupMonitoring.ticketPanel.exportCol.${exportColKey(col)}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${group.key}-${row['#']}`}>
                  {TICKET_DETAIL_MODAL_COLUMNS.map((col) => (
                    <TicketDetailCell key={col} column={col} row={row} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="ticket-detail-modal-footer">
          <button type="button" className="brand-modal-btn brand-modal-btn--ghost" onClick={onClose}>
            {t('groupMonitoring.ticketPanel.closeDetail')}
          </button>
          <button
            type="button"
            className="brand-modal-btn brand-modal-btn--primary"
            onClick={() => exportTicketGroupExcel(group, typeLabel)}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            {t('groupMonitoring.ticketPanel.exportIssue')}
          </button>
        </footer>
      </div>
    </BrandModalRoot>
  );
}

function exportColKey(col: keyof TicketExportRow): string {
  const map: Record<keyof TicketExportRow, string> = {
    'Issue ID': 'issueId',
    '#': 'rowNum',
    Account: 'account',
    Brand: 'brand',
    Platform: 'platform',
    Phone: 'phone',
    'Issue type': 'issueType',
    'Group name': 'groupName',
    'Group ID': 'groupId',
    'Invite link': 'inviteLink',
    Note: 'note',
  };
  return map[col];
}

function TicketDetailCell({ column, row }: { column: keyof TicketExportRow; row: TicketExportRow }) {
  const value = String(row[column]);

  if (column === 'Invite link' && value !== '—') {
    return (
      <td className="ticket-detail-cell ticket-detail-cell--link">
        <a href={value} target="_blank" rel="noopener noreferrer">
          {value}
        </a>
      </td>
    );
  }

  return <td className="ticket-detail-cell">{value}</td>;
}
