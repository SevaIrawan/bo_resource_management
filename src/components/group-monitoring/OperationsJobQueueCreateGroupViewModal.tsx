import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudUpload, Download, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import {
  canQueueSetPhotoFromCreateJob,
  isCreateGroupSetPhotoTabLocked,
} from '@/lib/createSetPhotoFlow';
import {
  brandGroupPhotoFileBase,
  brandGroupPhotoPreviewUrl,
  expectedBrandGroupPhotoFileName,
  listBrandGroupPhotos,
  pickAndSaveBrandGroupPhoto,
  type BrandGroupPhotoEntry,
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
type PhotoPickSource = 'none' | 'upload' | 'existing';

function formatSavedPhotoLabel(brandName: string): string {
  return expectedBrandGroupPhotoFileName(brandName);
}

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
  const [savedPhotos, setSavedPhotos] = useState<BrandGroupPhotoEntry[]>([]);
  const [selectedExistingPath, setSelectedExistingPath] = useState('');
  const [photoPickSource, setPhotoPickSource] = useState<PhotoPickSource>('none');
  const [loadingSavedPhotos, setLoadingSavedPhotos] = useState(false);

  const columns = jobQueueCreateGroupResultColumnIds();
  const rows = jobQueueCreateGroupResultTableRows(job);
  const canQueue = canQueueSetPhotoFromCreateJob(job, allJobs, photoPath);
  const setPhotoTabLocked = isCreateGroupSetPhotoTabLocked(job, allJobs);

  const savedPhotoOptions = useMemo(
    () =>
      savedPhotos.map((entry) => ({
        value: entry.path,
        label: formatSavedPhotoLabel(job.brandName),
      })),
    [job.brandName, savedPhotos],
  );

  const refreshSavedPhotos = useCallback(async () => {
    setLoadingSavedPhotos(true);
    try {
      const photos = await listBrandGroupPhotos(job.brandName);
      setSavedPhotos(photos);
      return photos;
    } finally {
      setLoadingSavedPhotos(false);
    }
  }, [job.brandName]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshSavedPhotos();
      if (cancelled) return;
      setPhotoPath(null);
      setPreviewUrl(null);
      setUploadStatus('idle');
      setSelectedExistingPath('');
      setPhotoPickSource('none');
    })();
    return () => {
      cancelled = true;
    };
  }, [job.brandName, refreshSavedPhotos]);

  useEffect(() => {
    if (tab !== 'set_photo') return;
    void refreshSavedPhotos();
  }, [tab, refreshSavedPhotos]);

  useEffect(() => {
    if (setPhotoTabLocked && tab === 'set_photo') {
      setTab('result');
    }
  }, [setPhotoTabLocked, tab]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function loadPreviewForPath(path: string): Promise<void> {
    const dataUrl = await brandGroupPhotoPreviewUrl(path);
    setPreviewUrl(dataUrl);
  }

  async function handleUploadBrandPhoto() {
    if (uploadingPhoto) return;
    setUploadingPhoto(true);
    setUploadStatus('uploading');
    setSelectedExistingPath('');
    setPhotoPickSource('upload');
    try {
      const result = await pickAndSaveBrandGroupPhoto(job.brandName);
      if (result.ok) {
        setPhotoPath(result.path);
        setPreviewUrl(result.dataUrl ?? (await brandGroupPhotoPreviewUrl(result.path)));
        setUploadStatus('complete');
        setTab('set_photo');
        await refreshSavedPhotos();
        return;
      }
      if (result.error === 'CANCELLED') {
        setUploadStatus(photoPath ? 'complete' : 'idle');
        return;
      }
      setUploadStatus('error');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSelectExistingPhoto(path: string) {
    setSelectedExistingPath(path);
    if (!path) {
      setPhotoPath(null);
      setPreviewUrl(null);
      setUploadStatus('idle');
      setPhotoPickSource('none');
      return;
    }
    setPhotoPickSource('existing');
    setPhotoPath(path);
    setUploadStatus('idle');
    await loadPreviewForPath(path);
  }

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

  function setPhotoFileNameHint(): string {
    return t('operations.jobQueue.setPhotoFileNameHint', {
      brand: brandGroupPhotoFileBase(job.brandName),
    });
  }

  function modalSubtitle(): string {
    if (tab === 'result') {
      return jobQueueViewSubtitle(job, t);
    }
    return t('operations.jobQueue.createViewSetPhotoSubtitle', { brand: job.brandName });
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
            <p className="brand-modal-subtitle">{modalSubtitle()}</p>
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
                aria-disabled={setPhotoTabLocked || undefined}
                disabled={setPhotoTabLocked}
                className={cn(
                  'operations-job-queue-exit-group-tab',
                  tab === 'set_photo' && 'operations-job-queue-exit-group-tab--active',
                  setPhotoTabLocked && 'operations-job-queue-exit-group-tab--disabled',
                )}
                onClick={() => {
                  if (setPhotoTabLocked) return;
                  setTab('set_photo');
                }}
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
          <div className="brand-modal-form set-photo-panel" role="tabpanel">
            <p className="operations-job-queue-form-note set-photo-panel__hint">
              {t('operations.jobQueue.createViewSetPhotoHint')}
            </p>

            <div className="set-photo-workbench">
              <div className="set-photo-col set-photo-col--upload">
                <p className="set-photo-col__label">
                  {t('operations.jobQueue.setPhotoUploadTitle')}
                </p>
                <div className="set-photo-col__body">
                  <button
                    type="button"
                    className={cn(
                      'set-photo-tile__upload',
                      uploadStatus === 'complete' && 'set-photo-tile__upload--done',
                      uploadStatus === 'uploading' && 'set-photo-tile__upload--busy',
                    )}
                    onClick={() => void handleUploadBrandPhoto()}
                    disabled={uploadingPhoto}
                  >
                    <span className="set-photo-tile__upload-glow" aria-hidden />
                    <CloudUpload className="set-photo-tile__upload-icon" strokeWidth={1.5} />
                    <span className="set-photo-tile__upload-title">
                      {uploadStatus === 'uploading'
                        ? t('operations.jobQueue.setPhotoUploading')
                        : t('operations.jobQueue.setPhotoUploadZoneTitle')}
                    </span>
                  </button>
                  {uploadStatus === 'complete' && photoPickSource === 'upload' ? (
                    <p className="set-photo-tile__status set-photo-tile__status--ok">
                      {t('operations.jobQueue.setPhotoUploadComplete')}
                    </p>
                  ) : null}
                  {uploadStatus === 'error' ? (
                    <p className="set-photo-tile__status set-photo-tile__status--err">
                      {t('operations.jobQueue.setPhotoUploadFailed')}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="set-photo-col set-photo-col--preview">
                <p className="set-photo-col__label">
                  {t('operations.jobQueue.setPhotoPreviewTitle')}
                </p>
                <div className="set-photo-col__body">
                  <div
                    className={cn(
                      'set-photo-tile__frame',
                      !previewUrl && 'set-photo-tile__frame--placeholder',
                    )}
                    aria-hidden={!previewUrl}
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={t('operations.jobQueue.setPhotoPreviewTitle')}
                        className="set-photo-tile__img"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="set-photo-divider" aria-hidden>
              <span>{t('operations.jobQueue.setPhotoOrDivider')}</span>
            </div>

            <div className="set-photo-saved-field">
              <label className="set-photo-saved-field__label" htmlFor="set-photo-saved-select">
                {t('operations.jobQueue.setPhotoUseExisting')}
              </label>
              <DarkSelect
                id="set-photo-saved-select"
                value={selectedExistingPath}
                onChange={(path) => void handleSelectExistingPhoto(path)}
                options={savedPhotoOptions}
                placeholder={
                  savedPhotoOptions.length === 0
                    ? t('operations.jobQueue.setPhotoNoSaved')
                    : t('operations.jobQueue.setPhotoSelectSaved')
                }
                ariaLabel={t('operations.jobQueue.setPhotoUseExisting')}
                disabled={loadingSavedPhotos || savedPhotoOptions.length === 0}
                className="set-photo-saved-field__select"
              />
            </div>

            {!photoPath ? (
              <p className="set-photo-tile__caption set-photo-tile__caption--below-existing">
                {setPhotoFileNameHint()}
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
