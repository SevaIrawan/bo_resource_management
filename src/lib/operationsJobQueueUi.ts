import type {
  AutomationJobAction,
  AutomationJobRecord,
  AutomationJobStatus,
} from '@/types/automationJob';

export type JobQueueTaskType = 'join' | 'create_group' | 'set_admin';

export function jobQueueTaskTypeToAction(taskType: JobQueueTaskType): AutomationJobAction {
  switch (taskType) {
    case 'join':
      return 'join_by_invite_link';
    case 'create_group':
      return 'create_group';
    case 'set_admin':
      return 'set_admin';
    default:
      return 'join_by_invite_link';
  }
}

export function jobQueueTargetsText(job: AutomationJobRecord): string {
  if (!job.payload.targets?.length) return '—';
  return job.payload.targets.join(', ');
}

export function jobQueueQueueTitleKey(taskType: JobQueueTaskType): string {
  switch (taskType) {
    case 'join':
      return 'operations.jobQueue.queueTableTitleJoin';
    case 'create_group':
      return 'operations.jobQueue.queueTableTitleCreate';
    case 'set_admin':
      return 'operations.jobQueue.queueTableTitleSetAdmin';
    default:
      return 'operations.jobQueue.queueTableTitleJoin';
  }
}

export function jobQueueEmptyKey(taskType: JobQueueTaskType): string {
  switch (taskType) {
    case 'join':
      return 'operations.jobQueue.emptyJoin';
    case 'create_group':
      return 'operations.jobQueue.emptyCreate';
    case 'set_admin':
      return 'operations.jobQueue.emptySetAdmin';
    default:
      return 'operations.jobQueue.emptyJoin';
  }
}

export const OPERATIONS_JOB_STATUS_CLASS: Record<AutomationJobStatus, string> = {
  queued: 'operations-job-status--queued',
  running: 'operations-job-status--running',
  completed: 'operations-job-status--completed',
  failed: 'operations-job-status--failed',
  cancelled: 'operations-job-status--cancelled',
};

export function isCreateGroupBatchJob(job: AutomationJobRecord): boolean {
  const total = Math.max(1, Math.floor(Number(job.payload.totalToCreate) || 1));
  return job.action === 'create_group' && total > 1;
}

export function isJobQueueBatchInProgress(job: AutomationJobRecord): boolean {
  if (!isCreateGroupBatchJob(job)) return false;
  return job.status === 'queued' || job.status === 'running';
}

export function jobQueueBatchProgress(job: AutomationJobRecord): { current: number; total: number } | null {
  if (!isCreateGroupBatchJob(job)) return null;
  const total = Math.max(1, Math.floor(Number(job.payload.totalToCreate) || 1));
  const current = job.progress?.current ?? 0;
  return { current, total };
}

export function formatJobQueueWhen(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function jobQueueDetail(job: AutomationJobRecord): string {
  if (job.error) return job.error;
  if (job.message) return job.message;
  if (job.payload.groupName) return job.payload.groupName;
  if (job.payload.groupId) return job.payload.groupId;
  if (job.payload.inviteLink) return job.payload.inviteLink;
  if (job.payload.groupLink) return job.payload.groupLink;
  if (job.payload.targets?.length) return job.payload.targets.join(', ');
  return '—';
}

export function jobQueueGroupName(job: AutomationJobRecord): string {
  if (isCreateGroupBatchJob(job)) {
    const prefix = job.payload.groupNamePrefix ?? job.payload.groupName ?? '—';
    const total = job.payload.totalToCreate ?? 1;
    const start = job.payload.startFrom ?? 1;
    const end = start + total - 1;
    return total > 1 ? `${prefix} (${start}–${end})` : prefix;
  }
  if (job.payload.groupName) return job.payload.groupName;
  if (job.payload.groupId) return job.payload.groupId;
  return '—';
}

export function jobQueueStatusLabel(
  job: AutomationJobRecord,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (job.status === 'queued' && job.paused) {
    return t('operations.jobQueue.statusJobPaused');
  }
  const batch = jobQueueBatchProgress(job);
  if (batch && (job.status === 'queued' || job.status === 'running')) {
    return t('operations.jobQueue.statusProcess', {
      current: batch.current,
      total: batch.total,
    });
  }
  return t(jobQueueStatusKey(job.status));
}

export function jobQueueActionLabel(
  job: AutomationJobRecord,
  t: (key: string) => string,
): string {
  if (isJobQueueBatchInProgress(job)) {
    return t('operations.jobQueue.actionProcessCreatingGroup');
  }
  return t(jobQueueActionKey(job.action));
}

export function jobQueueResultText(job: AutomationJobRecord): string {
  if (job.status === 'failed' && job.error) return job.error;
  const batch = jobQueueBatchProgress(job);
  if (batch && (job.status === 'running' || job.status === 'queued')) {
    return `${batch.current}/${batch.total}`;
  }
  if (job.message && job.message !== 'OK') return job.message;
  if (batch && job.status === 'completed') {
    return `${batch.current}/${batch.total} created`;
  }
  if (job.status === 'completed') return 'OK';
  return '—';
}

export function jobQueueStatusClass(job: AutomationJobRecord): string {
  if (job.status === 'queued' && job.paused) {
    return 'operations-job-status--paused';
  }
  if (isJobQueueBatchInProgress(job)) {
    return OPERATIONS_JOB_STATUS_CLASS.running;
  }
  return OPERATIONS_JOB_STATUS_CLASS[job.status];
}

export function jobQueueCanRun(job: AutomationJobRecord): boolean {
  if (job.status === 'running' || job.status === 'completed') return false;
  if (job.status === 'queued' && !job.paused) return false;
  return job.status === 'queued' || job.status === 'failed' || job.status === 'cancelled';
}

export function jobQueueCanPause(job: AutomationJobRecord): boolean {
  if (job.status === 'running') return true;
  return job.status === 'queued' && !job.paused;
}

export function jobQueueCanCancel(job: AutomationJobRecord): boolean {
  return job.status === 'queued' || job.status === 'running';
}

export function jobQueueCanDelete(_job: AutomationJobRecord): boolean {
  return true;
}

export function jobQueueStatusKey(status: AutomationJobStatus): string {
  switch (status) {
    case 'queued':
      return 'operations.jobQueue.statusQueued';
    case 'running':
      return 'operations.jobQueue.statusRunning';
    case 'completed':
      return 'operations.jobQueue.statusCompleted';
    case 'failed':
      return 'operations.jobQueue.statusFailed';
    case 'cancelled':
      return 'operations.jobQueue.statusCancelled';
    default:
      return 'operations.jobQueue.statusQueued';
  }
}

export function jobQueueActionKey(action: AutomationJobAction): string {
  switch (action) {
    case 'join_by_invite_link':
      return 'operations.jobQueue.actionJoin';
    case 'create_group':
      return 'operations.jobQueue.actionCreateGroup';
    case 'set_admin':
      return 'operations.jobQueue.actionSetAdmin';
    default:
      return 'operations.jobQueue.actionJoin';
  }
}
