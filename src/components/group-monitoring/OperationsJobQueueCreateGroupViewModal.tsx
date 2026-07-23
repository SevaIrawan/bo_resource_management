import { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import {
  canQueueSetPhotoFromCreateJob,
  isCreateGroupSetPhotoTabLocked,
} from '@/lib/createSetPhotoFlow';
import { exportJobQueueViewExcel } from '@/lib/exportExcel';
import { accountPlatformSubtitle } from '@/lib/platformSyncCopy';
import {
  jobQueueCreateGroupResultColumnIds,
  jobQueueCreateGroupResultTableRows,
  jobQueueViewMetaText,
  jobQueueViewSubtitle,
  jobQueueViewTableColumnLabel,
  type JobQueueViewTableColumnId,
  type JobQueueViewTableRow,
} from '@/lib/operationsJobQueueUi';
import { mapEnqueueJobQueueError } from '@/lib/mapEnqueueJobQueueError';
import type { QueueFromViewResult } from '@/lib/operationsJobQueueEnqueueResult';
import type { AutomationJobRecord } from '@/types/automationJob';

interface OperationsJobQueueCreateGroupViewModalProps {
  job: AutomationJobRecord;
  allJobs?: AutomationJobRecord[];
  open?: boolean;
  onClose: () => void;
  onQueueSetPhotoFromCreate?: (
    createJobId: string,
    photoPath: string,
  ) => Promise<QueueFromViewResult> | QueueFromViewResult;
}

function cellClassName(columnId: JobQueueViewTableColumnId): string | undefined {
  switch (columnId) {
    case 'groupName':
      return 'group-links-table__name';
    case 'groupId':
      return 'group-links-table__id';
    case 'inviteLink':
      return 'group-links-table__link';
    default:
      return undefined;
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

export function OperationsJobQueueCreateGroupViewModal({
  job,
  allJobs = [],
  open = true,
  onClose,
  onQueueSetPhotoFromCreate,
}: OperationsJobQueueCreateGroupViewModalProps) {
  const { t } = useLanguage();
  const [queueingSetPhoto, setQueueingSetPhoto] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  const columns = jobQueueCreateGroupResultColumnIds();
  const rows = jobQueueCreateGroupResultTableRows(job);

  const photoPath = job.payload.photoPath ?? null;
  const canQueue = canQueueSetPhotoFromCreateJob(job, allJobs, photoPath);
  const setPhotoAlreadyQueued = isCreateGroupSetPhotoTabLocked(job, allJobs);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleQueueSetPhoto() {
    if (!onQueueSetPhotoFromCreate || queueingSetPhoto || !photoPath || !canQueue) return;
    setQueueingSetPhoto(true);
    setQueueError(null);
    try {
      const result = await onQueueSetPhotoFromCreate(job.id, photoPath);
      if (!result.ok) {
        setQueueError(mapEnqueueJobQueueError(result.error, t));
        return;
      }
      onClose();
    } finally {
      setQueueingSetPhoto(false);
    }
  }

  function handleExport() {
    if (!rows.length) return;
    exportJobQueueViewExcel({
      accountName: job.accountName,
      action: job.action,
      columns,
      columnLabels: columns.map((columnId) => jobQueueViewTableColumnLabel(columnId, t)),
      rows,
    });
  }

  const queueBtnLabel = setPhotoAlreadyQueued
    ? t('operations.jobQueue.createViewSetPhotoQueued')
    : t('operations.jobQueue.createViewQueueSetPhoto');

  return (
    <BrandModalRoot open={open} onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--job-queue-detail brand-modal-panel--job-queue-create-view"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-queue-create-view-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <div className="brand-modal-header-main">
            <h2 id="job-queue-create-view-title" className="brand-modal-title">
              {accountPlatformSubtitle(job.accountName, job.platform)}
            </h2>
            <p className="brand-modal-subtitle">{jobQueueViewSubtitle(job, t)}</p>
          </div>
          <div className="brand-modal-header-actions">
            <button
              type="button"
              className="brand-modal-close"
              onClick={onClose}
              aria-label={t('groupMonitoring.accountCard.closeModal')}
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="brand-modal-form" role="tabpanel">
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

          <p className="ticket-detail-modal-meta">{jobQueueViewMetaText(job, t)}</p>

          {queueError ? (
            <p className="operations-job-queue-form-note operations-job-queue-form-note--warn">
              {queueError}
            </p>
          ) : null}

          <div className="brand-modal-actions brand-modal-actions--split">
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--ghost"
              onClick={handleExport}
              disabled={rows.length === 0}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {t('groupMonitoring.accountCard.export')}
            </button>
            {onQueueSetPhotoFromCreate && rows.length > 0 ? (
              <button
                type="button"
                className="brand-modal-btn brand-modal-btn--primary"
                disabled={!canQueue || queueingSetPhoto || setPhotoAlreadyQueued}
                onClick={() => void handleQueueSetPhoto()}
                title={!photoPath ? t('admin.brandPhoto.brandNotAvailable') : undefined}
              >
                {queueingSetPhoto ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : null}
                {queueBtnLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </BrandModalRoot>
  );
}
