import fs from 'node:fs';
import {
  enqueueAutomationJob,
  getJobQueueSnapshot,
} from './jobQueueStore';
import type { AutomationJobRecord } from './jobQueueTypes';

const DEFAULT_SET_PHOTO_MAX_PER_RUN = 30;

function resolveCreatedGroups(createJob: AutomationJobRecord) {
  const outcomes = createJob.payload.groupOutcomes;
  if (!outcomes?.length) return [];
  return outcomes
    .filter((row) => row.groupId.trim().length > 0 && row.createStatus !== 'failed')
    .map((row) => ({
      groupId: row.groupId,
      groupName: row.groupName,
      inviteLink: row.inviteLink,
      groupLink: row.groupLink,
    }));
}

function hasSetPhotoFollowUp(createJobId: string): boolean {
  const jobs = getJobQueueSnapshot().jobs;
  return jobs.some((job) => {
    if (job.action !== 'set_group_photo') return false;
    if (job.payload.sourceCreateJobId !== createJobId) return false;
    if (job.status === 'queued' || job.status === 'running' || job.status === 'completed') {
      return true;
    }
    return job.status === 'failed' && (job.progress?.current ?? 0) > 0;
  });
}

/**
 * Opsi C — setelah create_group selesai (ada grup created + photoPath di payload),
 * auto-enqueue set_group_photo follow-up. Create tetap valid meski foto gagal nanti.
 */
export function maybeAutoEnqueueSetPhotoFromCreate(createJob: AutomationJobRecord): void {
  if (createJob.action !== 'create_group') return;
  if (createJob.status !== 'completed' && createJob.status !== 'failed') return;

  const photoPath = createJob.payload.photoPath?.trim() ?? '';
  if (!photoPath || !fs.existsSync(photoPath)) return;

  const groups = resolveCreatedGroups(createJob);
  if (groups.length === 0) return;
  if (hasSetPhotoFollowUp(createJob.id)) return;

  const maxPerRun = DEFAULT_SET_PHOTO_MAX_PER_RUN;
  const chunks: Array<typeof groups> = [];
  for (let i = 0; i < groups.length; i += maxPerRun) {
    chunks.push(groups.slice(i, i + maxPerRun));
  }

  const needsSplit = chunks.length > 1;
  for (const chunk of chunks) {
    enqueueAutomationJob({
      brandName: createJob.brandName,
      platform: createJob.platform,
      accountId: createJob.accountId,
      accountName: createJob.accountName,
      sessionId: createJob.sessionId,
      action: 'set_group_photo',
      payload: {
        groups: chunk,
        sourceCreateJobId: createJob.id,
        setPhotoPhase: 'apply',
        photoPath,
        userId: createJob.payload.userId,
      },
      storedSessionString: createJob.storedSessionString ?? null,
      expectedPhone: createJob.expectedPhone,
      delay: createJob.delay,
      allowMultipleQueued: needsSplit,
    });
  }
}
