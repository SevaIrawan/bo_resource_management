import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { OperationsJobQueueDetailModal } from '@/components/group-monitoring/OperationsJobQueueDetailModal';
import { ScraperStatusMarquee } from '@/components/group-monitoring/ScraperStatusMarquee';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import {
  formatJobQueueWhen,
  isJobQueueBatchInProgress,
  isJobQueueStepInProgress,
  jobQueueCanCancel,
  jobQueueCanDelete,
  jobQueueCanPause,
  jobQueueCanRun,
  jobQueueRowActionMode,
  jobQueueEmptyKey,
  jobQueueGroupName,
  jobQueueBatchTotalText,
  jobQueueProgressPercent,
  jobQueueResultText,
  jobQueueStatusClass,
  jobQueueStatusLabel,
  isJobQueueTaskTypeSelected,
  type JobQueueTaskTypeSelection,
} from '@/lib/operationsJobQueueUi';
import type { AutomationJobRecord } from '@/types/automationJob';
import type { QueueFromViewResult } from '@/lib/operationsJobQueueEnqueueResult';

interface OperationsJobQueueTableProps {
  taskType: JobQueueTaskTypeSelection;
  jobs: AutomationJobRecord[];
  allJobs?: AutomationJobRecord[];
  showBrand?: boolean;
  onRun?: (jobId: string) => void;
  onPause?: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  onDeleteSelected?: (jobIds: string[]) => void;
  onQueueDeleteFromExit?: (exitJobId: string) => Promise<QueueFromViewResult> | QueueFromViewResult;
  onQueueSetPhotoFromCreate?: (
    createJobId: string,
    photoPath: string,
  ) => Promise<QueueFromViewResult> | QueueFromViewResult;
}

export function OperationsJobQueueTable({
  taskType,
  jobs,
  allJobs = [],
  showBrand = false,
  onRun,
  onPause,
  onCancel,
  onDeleteSelected,
  onQueueDeleteFromExit,
  onQueueSetPhotoFromCreate,
}: OperationsJobQueueTableProps) {
  const { t } = useLanguage();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [viewJobId, setViewJobId] = useState<string | null>(null);

  const viewJob = useMemo(
    () => jobs.find((job) => job.id === viewJobId) ?? null,
    [jobs, viewJobId],
  );

  const columns = buildQueueColumns(taskType, showBrand);
  const deletableJobs = useMemo(() => jobs.filter((job) => jobQueueCanDelete(job)), [jobs]);
  const selectionActive = selectedIds.size > 0;
  const allDeletableSelected =
    deletableJobs.length > 0 && deletableJobs.every((job) => selectedIds.has(job.id));

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(jobs.map((job) => job.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [jobs]);

  function toggleSelect(jobId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allDeletableSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(deletableJobs.map((job) => job.id)));
  }

  function handleDeleteSelected() {
    if (selectedIds.size === 0 || !onDeleteSelected) return;
    onDeleteSelected([...selectedIds]);
    setSelectedIds(new Set());
  }

  async function handleQueueDeleteFromExit(exitJobId: string): Promise<QueueFromViewResult> {
    if (!onQueueDeleteFromExit) return { ok: false, error: 'ENQUEUE_FAILED' };
    const result = await onQueueDeleteFromExit(exitJobId);
    if (result.ok) setViewJobId(null);
    return result;
  }

  async function handleQueueSetPhotoFromCreate(
    createJobId: string,
    photoPath: string,
  ): Promise<QueueFromViewResult> {
    if (!onQueueSetPhotoFromCreate) return { ok: false, error: 'ENQUEUE_FAILED' };
    const result = await onQueueSetPhotoFromCreate(createJobId, photoPath);
    if (result.ok) setViewJobId(null);
    return result;
  }

  return (
    <div className="operations-job-queue-table-wrap">
      <table className="operations-job-queue-table">
        <thead>
          <tr>
            <th className="operations-job-queue-select-col">
              {selectionActive ? (
                <div className="operations-job-queue-select-head">
                  <label className="operations-job-queue-select-all">
                    <input
                      type="checkbox"
                      checked={allDeletableSelected}
                      onChange={toggleSelectAll}
                    />
                    <span>{t('operations.jobQueue.selectAll')}</span>
                  </label>
                  <button
                    type="button"
                    className="operations-job-queue-icon-btn operations-job-queue-icon-btn--danger"
                    aria-label={t('operations.jobQueue.deleteSelected')}
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </th>
            {columns.map((col) => (
              <th key={col.key}>{t(col.labelKey)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="operations-job-queue-empty">
                {t(
                  isJobQueueTaskTypeSelected(taskType)
                    ? jobQueueEmptyKey(taskType)
                    : 'operations.jobQueue.emptySelectTask',
                )}
              </td>
            </tr>
          ) : (
            jobs.map((job) => (
              <tr key={job.id}>
                <td className="operations-job-queue-select-col">
                  <input
                    type="checkbox"
                    className="operations-job-queue-row-checkbox"
                    checked={selectedIds.has(job.id)}
                    disabled={!jobQueueCanDelete(job)}
                    onChange={() => toggleSelect(job.id)}
                  />
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      col.key === 'created' && 'tabular-nums',
                      col.key === 'progress' && 'operations-job-queue-detail',
                      col.key === 'actions' && 'operations-job-queue-actions-cell',
                    )}
                  >
                    {col.render(job, t, {
                      onRun,
                      onPause,
                      onCancel,
                      onView: (jobId) => setViewJobId(jobId),
                    })}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <OperationsJobQueueDetailModal
        job={viewJob}
        allJobs={allJobs}
        onClose={() => setViewJobId(null)}
        onQueueDeleteFromExit={handleQueueDeleteFromExit}
        onQueueSetPhotoFromCreate={handleQueueSetPhotoFromCreate}
      />
    </div>
  );
}

type JobQueueRowHandlers = {
  onRun?: (jobId: string) => void;
  onPause?: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  onView?: (jobId: string) => void;
};

type QueueColumnDef = {
  key: string;
  labelKey: string;
  render: (
    job: AutomationJobRecord,
    t: (key: string, vars?: Record<string, string | number>) => string,
    handlers: JobQueueRowHandlers,
  ) => ReactNode;
};

function JobQueueRowActions({
  job,
  t,
  handlers,
}: {
  job: AutomationJobRecord;
  t: (key: string) => string;
  handlers: JobQueueRowHandlers;
}) {
  const { onRun, onPause, onCancel, onView } = handlers;
  const mode = jobQueueRowActionMode(job);

  if (mode === 'view') {
    return (
      <div className="operations-job-queue-row-actions">
        <button
          type="button"
          className="operations-job-queue-btn operations-job-queue-btn--row"
          onClick={() => onView?.(job.id)}
        >
          {t('operations.jobQueue.actionView')}
        </button>
      </div>
    );
  }

  if (mode === 'run') {
    const canRun = jobQueueCanRun(job) && Boolean(onRun);
    return (
      <div className="operations-job-queue-row-actions">
        <button
          type="button"
          className="operations-job-queue-btn operations-job-queue-btn--row"
          disabled={!canRun}
          onClick={() => onRun?.(job.id)}
        >
          {t('operations.jobQueue.actionRun')}
        </button>
      </div>
    );
  }

  const canPause = jobQueueCanPause(job) && Boolean(onPause);
  const canCancel = jobQueueCanCancel(job) && Boolean(onCancel);

  return (
    <div className="operations-job-queue-row-actions">
      <button
        type="button"
        className="operations-job-queue-btn operations-job-queue-btn--row"
        disabled={!canPause}
        onClick={() => onPause?.(job.id)}
      >
        {t('operations.jobQueue.actionPause')}
      </button>
      <button
        type="button"
        className="operations-job-queue-btn operations-job-queue-btn--row operations-job-queue-btn--danger"
        disabled={!canCancel}
        onClick={() => onCancel?.(job.id)}
      >
        {t('operations.jobQueue.actionCancel')}
      </button>
    </div>
  );
}

function JobQueueProgressCell({
  job,
  t,
}: {
  job: AutomationJobRecord;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const stepActive = isJobQueueStepInProgress(job);
  const pct = jobQueueProgressPercent(job);
  const detail = jobQueueResultText(job, t);

  if (!stepActive) {
    return <span>{detail}</span>;
  }

  return (
    <div className="operations-job-queue-progress">
      <div
        className="operations-job-queue-progress-bar"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={detail}
      >
        <div className="operations-job-queue-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="operations-job-queue-progress-label">{detail}</span>
    </div>
  );
}

function buildQueueColumns(taskType: JobQueueTaskTypeSelection, showBrand: boolean): QueueColumnDef[] {
  const resolvedTaskType = isJobQueueTaskTypeSelected(taskType) ? taskType : 'join';
  const statusCol: QueueColumnDef = {
    key: 'status',
    labelKey: 'operations.jobQueue.colStatus',
    render: (job, t) => {
      const stepInProgress = isJobQueueStepInProgress(job);
      const batchInProgress = isJobQueueBatchInProgress(job);
      const statusLabel = jobQueueStatusLabel(job, t);
      return (
        <span className={cn('operations-job-status', jobQueueStatusClass(job))}>
          {stepInProgress || batchInProgress ? (
            <ScraperStatusMarquee label={statusLabel} />
          ) : (
            statusLabel
          )}
        </span>
      );
    },
  };

  const brandCol: QueueColumnDef = {
    key: 'brand',
    labelKey: 'operations.jobQueue.colBrand',
    render: (job) => job.brandName,
  };

  const accountCol: QueueColumnDef = {
    key: 'account',
    labelKey: 'operations.jobQueue.colAccount',
    render: (job) => job.accountName,
  };

  const createdCol: QueueColumnDef = {
    key: 'created',
    labelKey: 'operations.jobQueue.colCreated',
    render: (job) => formatJobQueueWhen(job.createdAt),
  };

  const actionsCol: QueueColumnDef = {
    key: 'actions',
    labelKey: 'operations.jobQueue.colActions',
    render: (job, t, handlers) => <JobQueueRowActions job={job} t={t} handlers={handlers} />,
  };

  const progressCol: QueueColumnDef = {
    key: 'progress',
    labelKey: 'operations.jobQueue.colProgress',
    render: (job, t) => <JobQueueProgressCell job={job} t={t} />,
  };

  const joinCols: QueueColumnDef[] = [
    statusCol,
    ...(showBrand ? [brandCol] : []),
    accountCol,
    {
      key: 'joined',
      labelKey: 'operations.jobQueue.colJoinedTotal',
      render: (job) => jobQueueBatchTotalText(job),
    },
    progressCol,
    createdCol,
    actionsCol,
  ];

  const createCols: QueueColumnDef[] = [
    statusCol,
    ...(showBrand ? [brandCol] : []),
    accountCol,
    {
      key: 'batch',
      labelKey: 'operations.jobQueue.colBatch',
      render: (job) => jobQueueGroupName(job),
    },
    progressCol,
    createdCol,
    actionsCol,
  ];

  const setAdminCols: QueueColumnDef[] = [
    statusCol,
    ...(showBrand ? [brandCol] : []),
    accountCol,
    {
      key: 'setAdmin',
      labelKey: 'operations.jobQueue.colSetAdminTotal',
      render: (job) => jobQueueBatchTotalText(job),
    },
    progressCol,
    createdCol,
    actionsCol,
  ];

  const leaveDeleteCols: QueueColumnDef[] = [
    statusCol,
    ...(showBrand ? [brandCol] : []),
    accountCol,
    {
      key: 'leaveDelete',
      labelKey: 'operations.jobQueue.colExitDeleteTotal',
      render: (job) => jobQueueBatchTotalText(job),
    },
    progressCol,
    createdCol,
    actionsCol,
  ];

  if (resolvedTaskType === 'create_group') return createCols;
  if (resolvedTaskType === 'set_admin') return setAdminCols;
  if (resolvedTaskType === 'exit_delete_group') return leaveDeleteCols;
  return joinCols;
}
