import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import { exportJobQueueViewExcel } from '@/lib/exportExcel';
import { accountPlatformSubtitle } from '@/lib/platformSyncCopy';
import {
  jobQueueViewMetaText,
  jobQueueViewResultSummary,
  jobQueueViewSubtitle,
  jobQueueViewTableColumnIds,
  jobQueueViewTableColumnLabel,
  jobQueueViewTableRows,
  type JobQueueViewTableColumnId,
  type JobQueueViewTableRow,
} from '@/lib/operationsJobQueueUi';
import type { AutomationJobRecord } from '@/types/automationJob';

interface OperationsJobQueueDetailModalProps {
  job: AutomationJobRecord | null;
  onClose: () => void;
}

function cellClassName(columnId: JobQueueViewTableColumnId): string | undefined {
  switch (columnId) {
    case 'groupName':
      return 'group-links-table__name';
    case 'groupId':
      return 'group-links-table__id';
    case 'inviteLink':
      return 'group-links-table__link';
    case 'status':
      return 'group-links-table__status';
    case 'count':
      return 'tabular-nums text-text-secondary';
    default:
      return 'text-text-secondary';
  }
}

function cellValue(row: JobQueueViewTableRow, columnId: JobQueueViewTableColumnId): string {
  switch (columnId) {
    case 'groupName':
      return row.groupName;
    case 'groupId':
      return row.groupId;
    case 'inviteLink':
      return row.inviteLink;
    case 'targetJoin':
      return row.targetJoin;
    case 'targetAdmin':
      return row.targetAdmin;
    case 'count':
      return row.count;
    case 'status':
      return row.status;
    default:
      return '—';
  }
}

function renderCell(row: JobQueueViewTableRow, columnId: JobQueueViewTableColumnId) {
  const value = cellValue(row, columnId);
  if (columnId === 'inviteLink' && value.startsWith('http')) {
    return (
      <a href={value} target="_blank" rel="noreferrer" title={value}>
        {value}
      </a>
    );
  }
  return value;
}

export function OperationsJobQueueDetailModal({
  job,
  onClose,
}: OperationsJobQueueDetailModalProps) {
  const { t } = useLanguage();
  const open = job !== null;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!job) return null;

  const record = job;
  const columns = jobQueueViewTableColumnIds(record);
  const rows = jobQueueViewTableRows(record, t);

  function handleExport() {
    if (!rows.length) return;
    exportJobQueueViewExcel({
      accountName: record.accountName,
      action: record.action,
      columns,
      columnLabels: columns.map((columnId) => jobQueueViewTableColumnLabel(columnId, t)),
      rows,
    });
  }

  return (
    <BrandModalRoot onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--job-queue-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-queue-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <div className="brand-modal-header-main">
            <h2 id="job-queue-detail-title" className="brand-modal-title">
              {accountPlatformSubtitle(record.accountName, record.platform)}
            </h2>
            <p className="brand-modal-subtitle">{jobQueueViewSubtitle(record, t)}</p>
          </div>
          <button
            type="button"
            className="brand-modal-close"
            onClick={onClose}
            aria-label={t('groupMonitoring.accountCard.closeModal')}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="brand-modal-form">
          <p className="sync-modal-message">{jobQueueViewResultSummary(record, t)}</p>

          {rows.length > 0 ? (
            <div className="group-links-table-wrap">
              <table className="group-links-table">
                <thead>
                  <tr>
                    {columns.map((columnId) => (
                      <th key={columnId}>{jobQueueViewTableColumnLabel(columnId, t)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      {columns.map((columnId) => (
                        <td
                          key={columnId}
                          className={cellClassName(columnId)}
                          title={cellValue(row, columnId)}
                        >
                          {renderCell(row, columnId)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="ticket-detail-modal-meta">{jobQueueViewMetaText(record, t)}</p>

          <div className="brand-modal-actions">
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--ghost"
              onClick={handleExport}
              disabled={rows.length === 0}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {t('groupMonitoring.accountCard.export')}
            </button>
          </div>
        </div>
      </div>
    </BrandModalRoot>
  );
}
