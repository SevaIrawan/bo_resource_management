import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScraperStatusMarquee } from '@/components/group-monitoring/ScraperStatusMarquee';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import {
  formatJobQueueWhen,
  isJobQueueBatchInProgress,
  jobQueueCanCancel,
  jobQueueCanDelete,
  jobQueueCanPause,
  jobQueueCanRun,
  jobQueueEmptyKey,
  jobQueueGroupName,
  jobQueueResultText,
  jobQueueStatusClass,
  jobQueueStatusLabel,
  jobQueueTargetsText,
  type JobQueueTaskType,
} from '@/lib/operationsJobQueueUi';
import type { AutomationJobRecord } from '@/types/automationJob';

interface OperationsJobQueueTableProps {
  taskType: JobQueueTaskType;
  jobs: AutomationJobRecord[];
  showBrand?: boolean;
  onRun?: (jobId: string) => void;
  onPause?: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  onDeleteSelected?: (jobIds: string[]) => void;
}

export function OperationsJobQueueTable({
  taskType,
  jobs,
  showBrand = false,
  onRun,
  onPause,
  onCancel,
  onDeleteSelected,
}: OperationsJobQueueTableProps) {
  const { t } = useLanguage();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

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
                {t(jobQueueEmptyKey(taskType))}
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
                      (col.key === 'result' || col.key === 'progress') && 'operations-job-queue-detail',
                      col.key === 'actions' && 'operations-job-queue-actions-cell',
                    )}
                  >
                    {col.render(job, t, { onRun, onPause, onCancel })}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

type JobQueueRowHandlers = {
  onRun?: (jobId: string) => void;
  onPause?: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
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
  const { onRun, onPause, onCancel } = handlers;
  const canRun = jobQueueCanRun(job) && Boolean(onRun);
  const canPause = jobQueueCanPause(job) && Boolean(onPause);
  const canCancel = jobQueueCanCancel(job) && Boolean(onCancel);

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

function buildQueueColumns(taskType: JobQueueTaskType, showBrand: boolean): QueueColumnDef[] {
  const statusCol: QueueColumnDef = {
    key: 'status',
    labelKey: 'operations.jobQueue.colStatus',
    render: (job, t) => {
      const batchInProgress = isJobQueueBatchInProgress(job);
      const statusLabel = jobQueueStatusLabel(job, t);
      return (
        <span className={cn('operations-job-status', jobQueueStatusClass(job))}>
          {batchInProgress ? <ScraperStatusMarquee label={statusLabel} /> : statusLabel}
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

  const resultCol: QueueColumnDef = {
    key: 'result',
    labelKey: 'operations.jobQueue.colResult',
    render: (job) => jobQueueResultText(job),
  };

  const progressCol: QueueColumnDef = {
    key: 'progress',
    labelKey: 'operations.jobQueue.colProgress',
    render: (job) => jobQueueResultText(job),
  };

  const joinCols: QueueColumnDef[] = [
    statusCol,
    ...(showBrand ? [brandCol] : []),
    accountCol,
    {
      key: 'group',
      labelKey: 'operations.jobQueue.colGroup',
      render: (job) => jobQueueGroupName(job),
    },
    createdCol,
    resultCol,
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
    createdCol,
    progressCol,
    actionsCol,
  ];

  const setAdminCols: QueueColumnDef[] = [
    statusCol,
    ...(showBrand ? [brandCol] : []),
    accountCol,
    {
      key: 'group',
      labelKey: 'operations.jobQueue.colGroup',
      render: (job) => jobQueueGroupName(job),
    },
    {
      key: 'targets',
      labelKey: 'operations.jobQueue.colTargets',
      render: (job) => jobQueueTargetsText(job),
    },
    createdCol,
    resultCol,
    actionsCol,
  ];

  if (taskType === 'create_group') return createCols;
  if (taskType === 'set_admin') return setAdminCols;
  return joinCols;
}
