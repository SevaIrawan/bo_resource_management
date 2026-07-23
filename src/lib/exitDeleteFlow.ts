import type {
  AutomationJobGroupItem,
  AutomationJobRecord,
} from '@/types/automationJob';
import { automationJobBusyGroupIds } from '@/lib/automationJobBusyGroups';

export function isExitDeleteExitJob(job: AutomationJobRecord): boolean {
  return job.action === 'leave_group' && job.payload.exitDeletePhase === 'exit';
}

export function isExitDeleteDeleteJob(job: AutomationJobRecord): boolean {
  return job.action === 'delete_group' && Boolean(job.payload.sourceExitJobId);
}

export function jobMatchesExitDeleteTaskType(job: AutomationJobRecord): boolean {
  return (
    job.action === 'exit_delete_group' ||
    isExitDeleteExitJob(job) ||
    isExitDeleteDeleteJob(job)
  );
}

/** Grup yang berhasil di-leave — sumber delete dari VIEW result exit job. */
export function resolveLeftGroupsFromExitJob(job: AutomationJobRecord): AutomationJobGroupItem[] {
  const outcomes = job.payload.groupOutcomes;
  if (outcomes?.length) {
    return outcomes
      .filter((row) => row.exitStatus === 'left')
      .map((row) => ({
        groupId: row.groupId,
        groupName: row.groupName,
        inviteLink: row.inviteLink,
        groupLink: row.groupLink,
      }));
  }

  const groups = job.payload.groups ?? [];
  const leftCount = Math.max(0, job.progress?.current ?? 0);
  return groups.slice(0, leftCount).map((group) => ({
    groupId: group.groupId,
    groupName: group.groupName,
    inviteLink: group.inviteLink,
    groupLink: group.groupLink,
  }));
}

function exitJobHasDeleteQueuedOrDone(
  exitJobId: string,
  jobs: AutomationJobRecord[],
): boolean {
  return jobs.some(
    (job) =>
      job.payload.sourceExitJobId === exitJobId &&
      (job.status === 'queued' ||
        job.status === 'running' ||
        job.status === 'completed' ||
        (job.status === 'failed' && (job.progress?.current ?? 0) > 0)),
  );
}

export function canQueueDeleteFromExitJob(
  exitJob: AutomationJobRecord,
  jobs: AutomationJobRecord[],
): boolean {
  if (!isExitDeleteExitJob(exitJob)) return false;
  if (exitJob.status !== 'completed' && exitJob.status !== 'failed') return false;
  if (resolveLeftGroupsFromExitJob(exitJob).length === 0) return false;
  return !exitJobHasDeleteQueuedOrDone(exitJob.id, jobs);
}

function findDeleteJobForExitJob(
  exitJobId: string,
  jobs: AutomationJobRecord[],
): AutomationJobRecord | undefined {
  const matches = jobs.filter(
    (job) => job.action === 'delete_group' && job.payload.sourceExitJobId === exitJobId,
  );
  if (matches.length === 0) return undefined;
  const priority = (job: AutomationJobRecord): number => {
    if (job.status === 'running') return 4;
    if (job.status === 'queued') return 3;
    if (job.status === 'completed') return 2;
    if (job.status === 'failed' && (job.progress?.current ?? 0) > 0) return 1;
    return 0;
  };
  return matches.slice().sort((a, b) => priority(b) - priority(a))[0];
}

/** Remark kolom Leave — follow-up delete chat auto setelah left. */
export function resolveExitJobDeleteFollowUpRemarkKey(
  exitJob: AutomationJobRecord,
  allJobs: AutomationJobRecord[],
): string | null {
  if (!isExitDeleteExitJob(exitJob)) return null;
  if (exitJob.status !== 'completed' && exitJob.status !== 'failed') return null;
  if (resolveLeftGroupsFromExitJob(exitJob).length === 0) return null;

  const deleteJob = findDeleteJobForExitJob(exitJob.id, allJobs);
  if (!deleteJob) {
    return 'operations.jobQueue.exitRemarkDeleteAutoPending';
  }
  switch (deleteJob.status) {
    case 'completed':
      return 'operations.jobQueue.statusCompleted';
    case 'running':
      return 'operations.jobQueue.exitRemarkDeleteRunning';
    case 'queued':
      return 'operations.jobQueue.exitRemarkDeleteQueued';
    case 'failed':
      if ((deleteJob.progress?.current ?? 0) > 0) {
        return 'operations.jobQueue.exitRemarkDeletePartial';
      }
      return null;
    default:
      return null;
  }
}

function isExitDeleteFlowJobForAccount(job: AutomationJobRecord, accountId: string): boolean {
  if (job.accountId !== accountId) return false;
  return (
    job.action === 'exit_delete_group' ||
    isExitDeleteExitJob(job) ||
    isExitDeleteDeleteJob(job)
  );
}

function addProcessedOutcomeGroupIds(
  processed: Set<string>,
  job: AutomationJobRecord,
): void {
  const outcomes = job.payload.groupOutcomes;
  if (outcomes?.length) {
    for (const row of outcomes) {
      const groupId = String(row.groupId ?? '').trim();
      if (!groupId) continue;
      if (row.exitStatus === 'left' || row.deleteStatus === 'deleted') {
        processed.add(groupId);
      }
    }
    return;
  }

  if (isExitDeleteExitJob(job)) {
    for (const group of resolveLeftGroupsFromExitJob(job)) {
      processed.add(group.groupId);
    }
    return;
  }

  for (const groupId of automationJobBusyGroupIds(job)) {
    processed.add(groupId);
  }
}

/**
 * Grup yang sudah pernah di-queue / dijalankan / selesai di alur exit-delete akun ini.
 * Dipakai blokir SETUP exit sampai Scraper memperbarui daily.
 */
export function exitDeleteProcessedGroupIdSet(
  jobs: AutomationJobRecord[],
  accountId: string,
): Set<string> {
  const processed = new Set<string>();
  const accountIdTrim = accountId.trim();
  if (!accountIdTrim) return processed;

  for (const job of jobs) {
    if (!isExitDeleteFlowJobForAccount(job, accountIdTrim)) continue;

    if (job.status === 'queued' || job.status === 'running') {
      for (const groupId of automationJobBusyGroupIds(job)) {
        processed.add(groupId);
      }
      continue;
    }

    if (job.status === 'completed' || job.status === 'failed') {
      addProcessedOutcomeGroupIds(processed, job);
    }
  }

  return processed;
}
