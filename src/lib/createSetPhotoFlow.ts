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
  if (createJobHasSetPhotoQueuedOrDone(createJob.id, jobs)) {
    return 'ALREADY_QUEUED';
  }
  return null;
}

function createJobHasSetPhotoQueuedOrDone(
  createJobId: string,
  jobs: AutomationJobRecord[],
): boolean {
  return jobs.some(
    (job) =>
      job.payload.sourceCreateJobId === createJobId &&
      (job.status === 'queued' ||
        job.status === 'running' ||
        job.status === 'completed' ||
        (job.status === 'failed' && (job.progress?.current ?? 0) > 0)),
  );
}

export function canQueueSetPhotoFromCreateJob(
  createJob: AutomationJobRecord,
  jobs: AutomationJobRecord[],
  photoPath: string | null | undefined,
): boolean {
  return resolveSetPhotoQueueBlockReason(createJob, jobs, photoPath) === null;
}
