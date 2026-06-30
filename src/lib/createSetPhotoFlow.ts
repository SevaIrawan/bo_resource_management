import type {
  AutomationJobGroupItem,
  AutomationJobRecord,
} from '@/types/automationJob';

export function isCreateGroupSourceJob(job: AutomationJobRecord): boolean {
  return job.action === 'create_group';
}

export function isSetPhotoFromCreateJob(job: AutomationJobRecord): boolean {
  return job.action === 'set_group_photo' && Boolean(job.payload.sourceCreateJobId);
}

export function jobMatchesCreateGroupTaskType(job: AutomationJobRecord): boolean {
  return isCreateGroupSourceJob(job) || isSetPhotoFromCreateJob(job);
}

/** Grup yang berhasil dibuat — sumber set photo dari VIEW result create job. */
export function resolveCreatedGroupsFromCreateJob(
  job: AutomationJobRecord,
): AutomationJobGroupItem[] {
  const outcomes = job.payload.groupOutcomes;
  if (outcomes?.length) {
    return outcomes
      .filter(
        (row) =>
          row.groupId.trim().length > 0 &&
          row.createStatus !== 'failed',
      )
      .map((row) => ({
        groupId: row.groupId,
        groupName: row.groupName,
        inviteLink: row.inviteLink,
        groupLink: row.groupLink,
      }));
  }
  return [];
}

export type SetPhotoQueueBlockReason =
  | 'NOT_COMPLETED'
  | 'NO_CREATED_GROUPS'
  | 'NO_PHOTO'
  | 'ALREADY_QUEUED';

export function resolveSetPhotoQueueBlockReason(
  createJob: AutomationJobRecord,
  jobs: AutomationJobRecord[],
  photoPath: string | null | undefined,
): SetPhotoQueueBlockReason | null {
  if (!isCreateGroupSourceJob(createJob)) return 'NOT_COMPLETED';
  if (createJob.status !== 'completed' && createJob.status !== 'failed') {
    return 'NOT_COMPLETED';
  }
  if (resolveCreatedGroupsFromCreateJob(createJob).length === 0) {
    return 'NO_CREATED_GROUPS';
  }
  if (!photoPath?.trim()) return 'NO_PHOTO';
  if (createJobHasSetPhotoFollowUp(createJob.id, jobs)) {
    return 'ALREADY_QUEUED';
  }
  return null;
}

function isSetPhotoFollowUpLockStatus(job: AutomationJobRecord): boolean {
  return (
    job.status === 'queued' ||
    job.status === 'running' ||
    job.status === 'completed' ||
    (job.status === 'failed' && (job.progress?.current ?? 0) > 0)
  );
}

/** Set photo job terkait create job — prioritas: running > queued > completed > partial fail > lainnya. */
export function findSetPhotoJobForCreateJob(
  createJobId: string,
  jobs: AutomationJobRecord[],
): AutomationJobRecord | undefined {
  const matches = jobs.filter(
    (job) =>
      job.action === 'set_group_photo' &&
      job.payload.sourceCreateJobId === createJobId,
  );
  if (matches.length === 0) return undefined;

  const priority = (job: AutomationJobRecord): number => {
    if (job.status === 'running') return 0;
    if (job.status === 'queued') return 1;
    if (job.status === 'completed') return 2;
    if (job.status === 'failed' && (job.progress?.current ?? 0) > 0) return 3;
    return 4;
  };

  return [...matches].sort((a, b) => {
    const delta = priority(a) - priority(b);
    if (delta !== 0) return delta;
    return b.createdAt.localeCompare(a.createdAt);
  })[0];
}

export function createJobHasSetPhotoFollowUp(
  createJobId: string,
  jobs: AutomationJobRecord[],
): boolean {
  return jobs.some(
    (job) =>
      job.action === 'set_group_photo' &&
      job.payload.sourceCreateJobId === createJobId &&
      isSetPhotoFollowUpLockStatus(job),
  );
}

function resolveSetPhotoJobFollowUpRemarkKey(
  setPhotoJob: AutomationJobRecord,
): string | null {
  switch (setPhotoJob.status) {
    case 'completed':
      return 'operations.jobQueue.statusCompleted';
    case 'running':
      return 'operations.jobQueue.createRemarkSetPhotoRunning';
    case 'queued':
      return 'operations.jobQueue.createRemarkSetPhotoQueued';
    case 'failed':
      if ((setPhotoJob.progress?.current ?? 0) > 0) {
        return 'operations.jobQueue.createRemarkSetPhotoPartial';
      }
      return null;
    default:
      return null;
  }
}

/** Remark kolom create tab — selaras dengan lock tab Set Photo di VIEW modal. */
export function resolveCreateJobSetPhotoFollowUpRemarkKey(
  createJob: AutomationJobRecord,
  allJobs: AutomationJobRecord[],
): string | null {
  if (!isCreateGroupSourceJob(createJob)) return null;
  if (createJob.status !== 'completed' && createJob.status !== 'failed') {
    return null;
  }
  if (resolveCreatedGroupsFromCreateJob(createJob).length === 0) return null;

  const setPhotoJob = findSetPhotoJobForCreateJob(createJob.id, allJobs);
  if (!setPhotoJob) return 'operations.jobQueue.createRemarkPressView';

  return resolveSetPhotoJobFollowUpRemarkKey(setPhotoJob);
}

/** Remark baris set_group_photo (follow-up dari create job). */
export function resolveSetPhotoJobRemarkKey(
  job: AutomationJobRecord,
): string | null {
  if (!isSetPhotoFromCreateJob(job)) return null;
  return resolveSetPhotoJobFollowUpRemarkKey(job);
}

export function canQueueSetPhotoFromCreateJob(
  createJob: AutomationJobRecord,
  jobs: AutomationJobRecord[],
  photoPath: string | null | undefined,
): boolean {
  return resolveSetPhotoQueueBlockReason(createJob, jobs, photoPath) === null;
}

/** Tab Set Photo — lock setelah set photo sudah di-queue / jalan / selesai untuk create job ini. */
export function isCreateGroupSetPhotoTabLocked(
  createJob: AutomationJobRecord,
  jobs: AutomationJobRecord[],
): boolean {
  if (!isCreateGroupSourceJob(createJob)) return false;
  return createJobHasSetPhotoFollowUp(createJob.id, jobs);
}
