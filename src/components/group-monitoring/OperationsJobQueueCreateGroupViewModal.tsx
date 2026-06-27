import { useEffect, useState } from 'react';
import { Download, Plus, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import {
  canQueueSetPhotoFromCreateJob,
  resolveSetPhotoQueueBlockReason,
} from '@/lib/createSetPhotoFlow';
import {
  brandGroupPhotoPreviewUrl,
  pickAndSaveBrandGroupPhoto,
  resolveBrandGroupPhotoPath,
} from '@/lib/brandGroupPhotoClient';
import { exportJobQueueViewExcel } from '@/lib/exportExcel';
import { accountPlatformSubtitle } from '@/lib/platformSyncCopy';
import {
  jobQueueCreateGroupResultColumnIds,
  jobQueueCreateGroupResultTableRows,
  jobQueueViewMetaText,
  jobQueueViewResultSummary,
  jobQueueViewSubtitle,
  jobQueueViewTableColumnLabel,
  type JobQueueViewTableColumnId,
  type JobQueueViewTableRow,
} from '@/lib/operationsJobQueueUi';
import { mapEnqueueJobQueueError } from '@/lib/mapEnqueueJobQueueError';
import type { QueueFromViewResult } from '@/lib/operationsJobQueueEnqueueResult';
import type { AutomationJobRecord } from '@/types/automationJob';

type CreateGroupViewTab = 'result' | 'set_photo';

interface OperationsJobQueueCreateGroupViewModalProps {
  job: AutomationJobRecord;
  allJobs?: AutomationJobRecord[];
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

type UploadStatus = 'idle' | 'uploading' | 'complete' | 'error';

export function OperationsJobQueueCreateGroupViewModal({
  job,
  allJobs = [],
  onClose,
  onQueueSetPhotoFromCreate,
}: OperationsJobQueueCreateGroupViewModalProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<CreateGroupViewTab>('result');
  const [queueingSetPhoto, setQueueingSetPhoto] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const columns = jobQueueCreateGroupResultColumnIds();
  const rows = jobQueueCreateGroupResultTableRows(job);
  const canQueue = canQueueSetPhotoFromCreateJob(job, allJobs, photoPath);
  const queueBlockReason = resolveSetPhotoQueueBlockReason(job, allJobs, photoPath);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await resolveBrandGroupPhotoPath(job.brandName);
      if (cancelled) return;
      if (resolved.ok) {
        setPhotoPath(resolved.path);
        const dataUrl = await brandGroupPhotoPreviewUrl(resolved.path);
        if (!cancelled) {
          setPreviewUrl(dataUrl);
          setUploadStatus('complete');
        }
        return;
      }
      setPhotoPath(null);
      setPreviewUrl(null);
      setUploadStatus('idle');
    })();
    return () => {
      cancelled = true;
    };
  }, [job.brandName]);

  useEffect(() => {
    if (!photoPath) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const url = await brandGroupPhotoPreviewUrl(photoPath);
      if (!cancelled) setPreviewUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleUploadBrandPhoto() {
    if (uploadingPhoto) return;
    setUploadingPhoto(true);
    setUploadStatus('uploading');
    try {
      const result = await pickAndSaveBrandGroupPhoto(job.brandName);
      if (result.ok) {
        setPhotoPath(result.path);
        if (result.dataUrl) {
          setPreviewUrl(result.dataUrl);
        } else {
          const dataUrl = await brandGroupPhotoPreviewUrl(result.path);
          setPreviewUrl(dataUrl);
        }
        setUploadStatus('complete');
        setTab('set_photo');
        return;
      }
      if (result.error === 'CANCELLED') {
        setUploadStatus('idle');
        return;
      }
      setUploadStatus('error');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleQueueSetPhoto() {
    if (!onQueueSetPhotoFromCreate || queueingSetPhoto || !photoPath || !canQueue) return;
    setQueueingSetPhoto(true);
    setQueueError(null);
    try {
      const result = await onQueueSetPhotoFromCreate(job.id, photoPath);
      if (!result.ok) {
        setQueueError(mapEnqueueJobQueueError(result.error, t));
      }
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

  function queueBlockMessage(): string | null {
    if (!queueBlockReason || canQueue) return null;
    switch (queueBlockReason) {
      case 'NOT_COMPLETED':
        return t('operations.jobQueue.setPhotoBlockNotCompleted');
      case 'NO_CREATED_GROUPS':
        return t('operations.jobQueue.setPhotoBlockNoGroups');
      case 'NO_PHOTO':
        return t('operations.jobQueue.setPhotoBlockNoPhoto');
      case 'ALREADY_QUEUED':
        return t('operations.jobQueue.setPhotoBlockAlreadyQueued');
      default:
        return null;
    }
  }

  return (
    <BrandModalRoot onBackdropClick={onClose}>
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
            <div
              className="operations-job-queue-exit-group-tabs operations-job-queue-exit-group-tabs--header"
              role="tablist"
              aria-label={t('operations.jobQueue.createViewTabList')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'result'}
                className={cn(
                  'operations-job-queue-exit-group-tab',
                  tab === 'result' && 'operations-job-queue-exit-group-tab--active',
                )}
                onClick={() => setTab('result')}
              >
                {t('operations.jobQueue.createViewTabResult')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'set_photo'}
                className={cn(
                  'operations-job-queue-exit-group-tab',
                  tab === 'set_photo' && 'operations-job-queue-exit-group-tab--active',
                )}
                onClick={() => setTab('set_photo')}
              >
                {t('operations.jobQueue.createViewTabSetPhoto')}
              </button>
            </div>
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

        {tab === 'result' ? (
          <div className="brand-modal-form" role="tabpanel">
            <p className="sync-modal-message">{jobQueueViewResultSummary(job, t)}</p>

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

            <div className="brand-modal-actions brand-modal-actions--split">
              <button
                type="button"
                className="brand-modal-btn brand-modal-btn--ghost"
                onClick={onClose}
              >
                {t('groupMonitoring.accountCard.closeModal')}
              </button>
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
        ) : (
          <div className="brand-modal-form" role="tabpanel">
            <p className="operations-job-queue-form-note">
              {t('operations.jobQueue.createViewSetPhotoHint')}
            </p>

            <div className="operations-job-queue-set-photo-row">
              <div className="operations-job-queue-set-photo-card">
                <p className="operations-job-queue-set-photo-card__title">
                  {t('operations.jobQueue.setPhotoPreviewTitle')}
                </p>
                <div className="operations-job-queue-set-photo-preview">
                  {uploadStatus === 'uploading' ? (
                    <p className="operations-job-queue-set-photo-preview__empty">
                      {t('operations.jobQueue.setPhotoUploading')}
                    </p>
                  ) : previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={t('operations.jobQueue.setPhotoPreviewTitle')}
                      className="operations-job-queue-set-photo-preview__img"
                    />
                  ) : (
                    <p className="operations-job-queue-set-photo-preview__empty">
                      {t('operations.jobQueue.setPhotoPreviewEmpty')}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="operations-job-queue-set-photo-card operations-job-queue-set-photo-upload"
                onClick={() => void handleUploadBrandPhoto()}
                disabled={uploadingPhoto}
              >
                <p className="operations-job-queue-set-photo-card__title">
                  {t('operations.jobQueue.setPhotoUploadTitle')}
                </p>
                <div
                  className={cn(
                    'operations-job-queue-set-photo-upload__zone',
                    uploadStatus === 'complete' && 'operations-job-queue-set-photo-upload__zone--done',
                    uploadStatus === 'uploading' && 'operations-job-queue-set-photo-upload__zone--busy',
                  )}
                >
                  {uploadStatus === 'uploading' ? (
                    <span className="operations-job-queue-set-photo-upload__caption">
                      {t('operations.jobQueue.setPhotoUploading')}
                    </span>
                  ) : (
                    <>
                      <Plus className="operations-job-queue-set-photo-upload__icon" strokeWidth={1.75} />
                      <span className="operations-job-queue-set-photo-upload__caption">
                        {t('operations.jobQueue.uploadPhotoJpgCaption')}
                      </span>
                    </>
                  )}
                </div>
                {uploadStatus === 'complete' ? (
                  <p className="operations-job-queue-set-photo-upload__status operations-job-queue-set-photo-upload__status--ok">
                    {t('operations.jobQueue.setPhotoUploadComplete')}
                  </p>
                ) : null}
                {uploadStatus === 'error' ? (
                  <p className="operations-job-queue-set-photo-upload__status operations-job-queue-set-photo-upload__status--err">
                    {t('operations.jobQueue.setPhotoUploadFailed')}
                  </p>
                ) : null}
              </button>
            </div>

            {queueBlockMessage() ? (
              <p className="operations-job-queue-form-note operations-job-queue-form-note--warn">
                {queueBlockMessage()}
              </p>
            ) : null}
            {queueError ? (
              <p className="operations-job-queue-form-note operations-job-queue-form-note--warn">
                {queueError}
              </p>
            ) : null}

            <div className="brand-modal-actions brand-modal-actions--split brand-modal-actions--create-set-photo">
              <button
                type="button"
                className="brand-modal-btn brand-modal-btn--ghost"
                onClick={onClose}
              >
                {t('operations.jobQueue.cancel')}
              </button>
              <button
                type="button"
                className="brand-modal-btn brand-modal-btn--primary"
                disabled={queueingSetPhoto || !canQueue || !photoPath}
                onClick={() => void handleQueueSetPhoto()}
              >
                {t('operations.jobQueue.setupSave')}
              </button>
            </div>
          </div>
        )}
      </div>
    </BrandModalRoot>
  );
}
