import type {
  AutomationJobAction,
  AutomationJobRecord,
  AutomationJobStatus,
} from '@/types/automationJob';
import {
  isExitDeleteDeleteJob,
  isExitDeleteExitJob,
  jobMatchesExitDeleteTaskType,
} from '@/lib/exitDeleteFlow';
import {
  jobMatchesCreateGroupTaskType,
} from '@/lib/createSetPhotoFlow';

export type JobQueueTaskType =
  | 'join'
  | 'create_group'
  | 'set_admin'
  | 'exit_delete_group';

/** Belum pilih task — default bar Job Queue. */
export type JobQueueTaskTypeSelection = JobQueueTaskType | '';

export function isJobQueueTaskTypeSelected(
  taskType: JobQueueTaskTypeSelection,
): taskType is JobQueueTaskType {
  return taskType !== '';
}

function isGroupBatchJobAction(action: AutomationJobAction): boolean {
  return (
    action === 'join_by_invite_link' ||
    action === 'set_admin' ||
    action === 'set_group_photo' ||
    action === 'leave_group' ||
    action === 'delete_group' ||
    action === 'exit_delete_group'
  );
}

export function jobMatchesTaskType(job: AutomationJobRecord, taskType: JobQueueTaskType): boolean {
  switch (taskType) {
    case 'join':
      return job.action === 'join_by_invite_link';
    case 'create_group':
      return jobMatchesCreateGroupTaskType(job);
    case 'set_admin':
      return job.action === 'set_admin';
    case 'exit_delete_group':
      return jobMatchesExitDeleteTaskType(job);
    default:
      return false;
  }
}

/** Hanya untuk tab join / set_admin — exit & create pakai jobMatchesTaskType. */
export function jobQueueTaskTypeToAction(
  taskType: Exclude<JobQueueTaskType, 'exit_delete_group' | 'create_group'>,
): AutomationJobAction {
  switch (taskType) {
    case 'join':
      return 'join_by_invite_link';
    case 'set_admin':
      return 'set_admin';
    default:
      return 'join_by_invite_link';
  }
}

export function jobQueueQueueTitleKey(taskType: JobQueueTaskType): string {
  switch (taskType) {
    case 'join':
      return 'operations.jobQueue.queueTableTitleJoin';
    case 'create_group':
      return 'operations.jobQueue.queueTableTitleCreate';
    case 'set_admin':
      return 'operations.jobQueue.queueTableTitleSetAdmin';
    case 'exit_delete_group':
      return 'operations.jobQueue.queueTableTitleExitDelete';
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
    case 'exit_delete_group':
      return 'operations.jobQueue.emptyExitDelete';
    default:
      return 'operations.jobQueue.emptyJoin';
  }
}

const OPERATIONS_JOB_STATUS_CLASS: Record<AutomationJobStatus, string> = {
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

export function isAccountBatchJob(job: AutomationJobRecord): boolean {
  if (isCreateGroupBatchJob(job)) return true;
  const groupCount = job.payload.groups?.length ?? 0;
  return (isGroupBatchJobAction(job.action) && groupCount > 1);
}

export function accountJobStepTotal(job: AutomationJobRecord): number {
  if (job.progress?.total && job.progress.total > 0) return job.progress.total;
  if (job.payload.groups?.length) return job.payload.groups.length;
  if (isCreateGroupBatchJob(job)) {
    return Math.max(1, Math.floor(Number(job.payload.totalToCreate) || 1));
  }
  return 1;
}

export function isJobQueueBatchInProgress(job: AutomationJobRecord): boolean {
  if (job.status !== 'queued' && job.status !== 'running') return false;
  return isAccountBatchJob(job);
}

export function isJobQueueStepInProgress(job: AutomationJobRecord): boolean {
  if (job.status !== 'queued' && job.status !== 'running') return false;
  if (isAccountBatchJob(job)) return true;
  if (isGroupBatchJobAction(job.action) && Boolean(job.progress)) {
    return true;
  }
  return false;
}

export function jobQueueStepProgress(
  job: AutomationJobRecord,
): { current: number; total: number; label?: string } | null {
  if (!job.progress) return null;
  if (isCreateGroupBatchJob(job)) return job.progress;
  if (isGroupBatchJobAction(job.action)) {
    return job.progress;
  }
  return null;
}

export function jobQueueProgressPercent(job: AutomationJobRecord): number {
  const step = jobQueueStepProgress(job);
  if (!step || step.total <= 0) return 0;
  return Math.min(100, Math.round((step.current / step.total) * 100));
}

export function jobQueueBatchProgress(job: AutomationJobRecord): { current: number; total: number } | null {
  if (job.progress && job.progress.total > 0) {
    return { current: job.progress.current, total: job.progress.total };
  }
  const total = accountJobStepTotal(job);
  if (total > 1) return { current: 0, total };
  if (!isCreateGroupBatchJob(job)) return null;
  return { current: 0, total };
}

export function formatJobQueueWhen(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function jobQueueGroupName(job: AutomationJobRecord): string {
  if (isCreateGroupBatchJob(job)) {
    const prefix = job.payload.groupNamePrefix ?? job.payload.groupName ?? '—';
    const total = job.payload.totalToCreate ?? 1;
    const start = job.payload.startFrom ?? 1;
    const end = start + total - 1;
    return total > 1 ? `${prefix} (${start}–${end})` : prefix;
  }
  const groups = job.payload.groups;
  if (groups?.length) {
    if (groups.length === 1) return groups[0].groupName ?? groups[0].groupId ?? '1';
    return String(groups.length);
  }
  if (job.payload.groupName) return job.payload.groupName;
  if (job.payload.groupId) return job.payload.groupId;
  return '—';
}

/** Modal VIEW create group — nama prefix saja, tanpa rentang (1–5). */
export function jobQueueCreateGroupViewName(job: AutomationJobRecord): string {
  const prefix =
    job.payload.groupNamePrefix?.trim() ||
    job.payload.groupName?.trim() ||
    job.progress?.label?.trim();
  return prefix || '—';
}

/** Total grup dalam satu job akun (join / set admin). */
export function jobQueueBatchTotalText(job: AutomationJobRecord): string {
  const total = accountJobStepTotal(job);
  return total > 0 ? String(total) : '—';
}

export function jobQueueStatusLabel(
  job: AutomationJobRecord,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (job.status === 'queued' && job.paused) {
    return t('operations.jobQueue.statusJobPaused');
  }
  const batch = jobQueueBatchProgress(job);
  const step = jobQueueStepProgress(job);
  if (job.status === 'running' && batch) {
    return t('operations.jobQueue.statusProcess', {
      current: batch.current,
      total: batch.total,
    });
  }
  if (step && job.status === 'running' && step.label?.trim()) {
    return step.label.trim();
  }
  if (step && job.status === 'running') {
    return t('operations.jobQueue.statusProcess', {
      current: step.current,
      total: step.total,
    });
  }
  return t(jobQueueStatusKey(job.status));
}

export function jobQueueResultText(
  job: AutomationJobRecord,
  t?: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (job.status === 'failed' && job.error) return job.error;
  const batch = jobQueueBatchProgress(job);
  const step = jobQueueStepProgress(job);
  const progress = batch ?? step;
  if (progress && (job.status === 'running' || job.status === 'queued')) {
    if (step?.label?.trim()) return `${progress.current}/${progress.total} — ${step.label.trim()}`;
    if (t) {
      return t('operations.jobQueue.resultProgress', {
        current: progress.current,
        total: progress.total,
      });
    }
    return `${progress.current}/${progress.total}`;
  }
  if (job.message && job.message !== 'OK') return job.message;
  if (batch && job.status === 'completed') {
    if (t && isGroupBatchJobAction(job.action)) {
      if (job.action === 'exit_delete_group') {
        return t('operations.jobQueue.resultSuccessExited', { count: batch.current });
      }
      return t('operations.jobQueue.resultSuccessGroups', { count: batch.current });
    }
    return `${batch.current}/${batch.total} created`;
  }
  if (job.status === 'completed') return 'OK';
  return '—';
}

export function jobQueueStatusClass(job: AutomationJobRecord): string {
  if (job.status === 'queued' && job.paused) {
    return 'operations-job-status--paused';
  }
  if (isJobQueueStepInProgress(job)) {
    return OPERATIONS_JOB_STATUS_CLASS.running;
  }
  return OPERATIONS_JOB_STATUS_CLASS[job.status];
}

export function jobQueueCanRun(job: AutomationJobRecord): boolean {
  if (job.status === 'running' || job.status === 'completed') return false;
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

/** Satu tombol per status: completed→VIEW, running→PAUSE+CANCEL, queue/failed→RUN. */
export type JobQueueRowActionMode = 'view' | 'run' | 'active';

export function jobQueueRowActionMode(job: AutomationJobRecord): JobQueueRowActionMode {
  if (job.status === 'completed') return 'view';
  if (job.status === 'running') return 'active';
  return 'run';
}

export function jobQueueViewSubtitle(
  job: AutomationJobRecord,
  t: (key: string) => string,
): string {
  return [t(jobQueueActionKey(job.action)), job.brandName, t(jobQueueStatusKey(job.status))].join(
    ' · ',
  );
}

export function jobQueueViewResultSummary(
  job: AutomationJobRecord,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (job.status === 'failed' && job.error) return job.error;
  return jobQueueResultText(job, t);
}

export type JobQueueViewTableColumnId =
  | 'groupName'
  | 'groupId'
  | 'inviteLink'
  | 'targetJoin'
  | 'targetAdmin'
  | 'count'
  | 'status';

export interface JobQueueViewTableRow {
  key: string;
  groupName: string;
  groupId: string;
  inviteLink: string;
  targetJoin: string;
  targetAdmin: string;
  count: string;
  status: string;
}

const VIEW_COL_I18N: Record<JobQueueViewTableColumnId, string> = {
  groupName: 'operations.jobQueue.viewColGroupName',
  groupId: 'operations.jobQueue.viewColGroupId',
  inviteLink: 'operations.jobQueue.viewColInviteLink',
  targetJoin: 'operations.jobQueue.viewColTargetJoin',
  targetAdmin: 'operations.jobQueue.viewColTargetAdmin',
  count: 'operations.jobQueue.viewColCount',
  status: 'operations.jobQueue.viewColStatus',
};

export function jobQueueViewTableColumnIds(
  job: AutomationJobRecord,
): JobQueueViewTableColumnId[] {
  if (job.action === 'create_group') {
    return ['groupName', 'groupId', 'inviteLink', 'status'];
  }
  if (job.action === 'set_admin') {
    return ['groupName', 'groupId', 'inviteLink', 'targetAdmin', 'status'];
  }
  if (job.action === 'set_group_photo') {
    return ['groupName', 'groupId', 'inviteLink', 'status'];
  }
  if (job.action === 'leave_group' || job.action === 'delete_group' || job.action === 'exit_delete_group') {
    return ['groupName', 'groupId', 'inviteLink', 'targetJoin', 'status'];
  }
  return ['groupName', 'groupId', 'inviteLink', 'targetJoin', 'status'];
}

function jobQueueViewRowStatusLabel(
  job: AutomationJobRecord,
  rowIndex: number,
  t: (key: string) => string,
): string {
  if (job.status === 'completed') {
    return t('operations.jobQueue.statusCompleted');
  }
  if (job.status === 'failed') {
    const done = Math.max(0, job.progress?.current ?? 0);
    if (rowIndex < done) {
      return t('operations.jobQueue.statusCompleted');
    }
    return t('operations.jobQueue.statusFailed');
  }
  if (job.status === 'cancelled') {
    return t('operations.jobQueue.statusCancelled');
  }
  return t(jobQueueStatusKey(job.status));
}

function resolveTargetAdminLabel(job: AutomationJobRecord): string {
  const names = job.payload.targetAccountNames?.filter(Boolean);
  if (names?.length) return names.join(', ');
  const phones = job.payload.targets?.filter(Boolean);
  if (phones?.length) return phones.join(', ');
  return '—';
}

function resolveInviteLink(group: {
  inviteLink?: string;
  groupLink?: string;
}): string {
  return group.inviteLink?.trim() || group.groupLink?.trim() || '—';
}

export function jobQueueCreateGroupResultColumnIds(): JobQueueViewTableColumnId[] {
  return ['groupName', 'groupId', 'inviteLink'];
}

function resolveCreateGroupResultOutcomes(
  job: AutomationJobRecord,
): NonNullable<AutomationJobRecord['payload']['groupOutcomes']> {
  const outcomes = job.payload.groupOutcomes ?? [];
  return outcomes.filter((row) => row.createStatus !== 'failed');
}

/** Tab Result create group — hanya grup created, tanpa kolom Status. */
export function jobQueueCreateGroupResultTableRows(
  job: AutomationJobRecord,
): JobQueueViewTableRow[] {
  const createdOutcomes = resolveCreateGroupResultOutcomes(job);
  if (createdOutcomes.length > 0) {
    return createdOutcomes.map((row, index) => ({
      key: row.groupId || String(index),
      groupName: row.groupName?.trim() || row.groupId || '—',
      groupId: row.groupId || '—',
      inviteLink: resolveInviteLink(row),
      targetJoin: '—',
      targetAdmin: '—',
      count: '—',
      status: '—',
    }));
  }

  return [
    {
      key: 'create-batch',
      groupName: jobQueueCreateGroupViewName(job),
      groupId: '—',
      inviteLink: '—',
      targetJoin: '—',
      targetAdmin: '—',
      count: '—',
      status: '—',
    },
  ];
}

export function jobQueueViewTableRows(
  job: AutomationJobRecord,
  t: (key: string) => string,
): JobQueueViewTableRow[] {
  if (job.action === 'create_group') {
    const createdOutcomes = resolveCreateGroupResultOutcomes(job);

    if (createdOutcomes.length > 0) {
      return createdOutcomes.map((row, index) => ({
        key: row.groupId || String(index),
        groupName: row.groupName?.trim() || row.groupId || '—',
        groupId: row.groupId || '—',
        inviteLink: resolveInviteLink(row),
        targetJoin: '—',
        targetAdmin: '—',
        count: '—',
        status: t('operations.jobQueue.createStatusCreated'),
      }));
    }

    const total = Math.max(1, Math.floor(Number(job.payload.totalToCreate) || 1));
    const count =
      job.status === 'completed' || job.status === 'failed'
        ? String(job.progress?.current ?? total)
        : String(total);
    return [
      {
        key: 'create-batch',
        groupName: jobQueueCreateGroupViewName(job),
        groupId: '—',
        inviteLink: '—',
        targetJoin: '—',
        targetAdmin: '—',
        count,
        status: jobQueueViewRowStatusLabel(job, 0, t),
      },
    ];
  }

  const groups = job.payload.groups ?? [];
  const targetAdmin = resolveTargetAdminLabel(job);

  if (isExitDeleteExitJob(job)) {
    const outcomes = job.payload.groupOutcomes?.length
      ? job.payload.groupOutcomes
      : groups.map((group) => ({
          groupId: group.groupId,
          groupName: group.groupName,
          inviteLink: group.inviteLink,
          groupLink: group.groupLink,
          exitStatus: 'pending' as const,
        }));
    return outcomes.map((row, index) => ({
      key: row.groupId || String(index),
      groupName: row.groupName?.trim() || row.groupId || '—',
      groupId: row.groupId || '—',
      inviteLink: resolveInviteLink(row),
      targetJoin: job.accountName,
      targetAdmin: '—',
      count: '—',
      status:
        row.exitStatus === 'left'
          ? t('operations.jobQueue.exitStatusLeft')
          : row.exitStatus === 'failed'
            ? t('operations.jobQueue.exitStatusFailed')
            : jobQueueViewRowStatusLabel(job, index, t),
    }));
  }

  if (isExitDeleteDeleteJob(job)) {
    return groups.map((group, index) => ({
      key: group.groupId || String(index),
      groupName: group.groupName?.trim() || group.groupId || '—',
      groupId: group.groupId || '—',
      inviteLink: resolveInviteLink(group),
      targetJoin: job.accountName,
      targetAdmin: '—',
      count: '—',
      status: jobQueueViewRowStatusLabel(job, index, t),
    }));
  }

  if (job.action === 'set_admin') {
    return groups.map((group, index) => ({
      key: group.groupId || String(index),
      groupName: group.groupName?.trim() || group.groupId || '—',
      groupId: group.groupId || '—',
      inviteLink: resolveInviteLink(group),
      targetJoin: '—',
      targetAdmin,
      count: '—',
      status: jobQueueViewRowStatusLabel(job, index, t),
    }));
  }

  if (job.action === 'set_group_photo') {
    const outcomes: NonNullable<AutomationJobRecord['payload']['groupOutcomes']> =
      job.payload.groupOutcomes?.length
        ? job.payload.groupOutcomes
        : groups.map((group) => ({
            groupId: group.groupId,
            groupName: group.groupName,
            inviteLink: group.inviteLink,
            groupLink: group.groupLink,
          }));
    return outcomes.map((row, index) => ({
      key: row.groupId || String(index),
      groupName: row.groupName?.trim() || row.groupId || '—',
      groupId: row.groupId || '—',
      inviteLink: resolveInviteLink(row),
      targetJoin: '—',
      targetAdmin: '—',
      count: '—',
      status:
        row.photoStatus === 'set'
          ? t('operations.jobQueue.photoStatusSet')
          : row.photoStatus === 'failed'
            ? t('operations.jobQueue.photoStatusFailed')
            : jobQueueViewRowStatusLabel(job, index, t),
    }));
  }

  if (job.action === 'leave_group' || job.action === 'delete_group' || job.action === 'exit_delete_group') {
    return groups.map((group, index) => ({
      key: group.groupId || String(index),
      groupName: group.groupName?.trim() || group.groupId || '—',
      groupId: group.groupId || '—',
      inviteLink: resolveInviteLink(group),
      targetJoin: job.accountName,
      targetAdmin: '—',
      count: '—',
      status: jobQueueViewRowStatusLabel(job, index, t),
    }));
  }

  return groups.map((group, index) => ({
    key: group.groupId || String(index),
    groupName: group.groupName?.trim() || group.groupId || '—',
    groupId: group.groupId || '—',
    inviteLink: resolveInviteLink(group),
    targetJoin: job.accountName,
    targetAdmin: '—',
    count: '—',
    status: jobQueueViewRowStatusLabel(job, index, t),
  }));
}

export function jobQueueViewTableColumnLabel(
  columnId: JobQueueViewTableColumnId,
  t: (key: string) => string,
): string {
  return t(VIEW_COL_I18N[columnId]);
}

export function jobQueueViewMetaText(
  job: AutomationJobRecord,
  t: (key: string) => string,
): string {
  const parts = [`${t('operations.jobQueue.colCreated')}: ${formatJobQueueWhen(job.createdAt)}`];
  if (job.finishedAt) {
    parts.push(`${t('operations.jobQueue.viewDetailFinished')}: ${formatJobQueueWhen(job.finishedAt)}`);
  }
  return parts.join(' · ');
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
    case 'set_group_photo':
      return 'operations.jobQueue.actionSetGroupPhoto';
    case 'set_admin':
      return 'operations.jobQueue.actionSetAdmin';
    case 'exit_delete_group':
      return 'operations.jobQueue.actionExitDelete';
    case 'leave_group':
      return 'operations.jobQueue.actionExitPhase';
    case 'delete_group':
      return 'operations.jobQueue.actionDeletePhase';
    default:
      return 'operations.jobQueue.actionJoin';
  }
}
