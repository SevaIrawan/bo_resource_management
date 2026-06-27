import { buildAutomationJobRunContext } from '@/lib/automationJobRunContext';
import { enqueueAutomationJob } from '@/lib/automationJobQueueClient';
import { accountRowFromAutomationJob } from '@/lib/accountRowFromAutomationJob';
import { resolveCreatedGroupsFromCreateJob } from '@/lib/createSetPhotoFlow';
import type { AutomationJobRecord } from '@/types/automationJob';

/** Set group photo hanya grup created di VIEW result create — satu foto per brand. */
export async function enqueueSetPhotoFromCreateJob(
  createJob: AutomationJobRecord,
  photoPath: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const groups = resolveCreatedGroupsFromCreateJob(createJob);
  if (groups.length === 0) return { ok: false, error: 'NO_CREATED_GROUPS' };

  const trimmedPhoto = photoPath.trim();
  if (!trimmedPhoto) return { ok: false, error: 'PHOTO_NOT_FOUND' };

  const account = accountRowFromAutomationJob(createJob);
  const ctx = await buildAutomationJobRunContext(account, 'set_group_photo');

  return enqueueAutomationJob({
    brandName: createJob.brandName,
    platform: createJob.platform,
    accountId: createJob.accountId,
    accountName: createJob.accountName,
    sessionId: ctx.sessionId,
    action: 'set_group_photo',
    payload: {
      groups,
      sourceCreateJobId: createJob.id,
      setPhotoPhase: 'apply',
      photoPath: trimmedPhoto,
    },
    storedSessionString: createJob.storedSessionString ?? ctx.storedSessionString,
    expectedPhone: createJob.expectedPhone ?? ctx.expectedPhone,
    delay: ctx.delay,
  });
}
