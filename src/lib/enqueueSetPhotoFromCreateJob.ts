import { buildAutomationJobRunContext } from '@/lib/automationJobRunContext';
import { enqueueAutomationJob } from '@/lib/automationJobQueueClient';
import { accountRowFromAutomationJob } from '@/lib/accountRowFromAutomationJob';
import { resolveCreatedGroupsFromCreateJob } from '@/lib/createSetPhotoFlow';
import { resolveCurrentUserId } from '@/lib/brandGroupPhotoStorage';
import {
  readWhatsAppWorkerSettings,
  readTelegramWorkerSettings,
} from '@/config/workerPlatformSettings';
import type { AutomationJobRecord } from '@/types/automationJob';

/** Set group photo hanya grup created di VIEW result create — satu foto per brand. */
export async function enqueueSetPhotoFromCreateJob(
  createJob: AutomationJobRecord,
  photoPath: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const allGroups = resolveCreatedGroupsFromCreateJob(createJob);
  if (allGroups.length === 0) return { ok: false, error: 'NO_CREATED_GROUPS' };

  const trimmedPhoto = photoPath.trim();
  if (!trimmedPhoto) return { ok: false, error: 'PHOTO_NOT_FOUND' };

  const workerSettings =
    createJob.platform === 'telegram'
      ? readTelegramWorkerSettings()
      : readWhatsAppWorkerSettings();
  const maxPerRun = Math.max(1, workerSettings.inviteLink.maxPerRun || 30);

  const account = accountRowFromAutomationJob(createJob);
  const ctx = await buildAutomationJobRunContext(account, 'set_group_photo');
  const userId = await resolveCurrentUserId();

  const chunks: Array<typeof allGroups> = [];
  for (let i = 0; i < allGroups.length; i += maxPerRun) {
    chunks.push(allGroups.slice(i, i + maxPerRun));
  }

  const needsSplit = chunks.length > 1;
  let lastResult: { ok: true; jobId: string } | { ok: false; error: string } = {
    ok: false,
    error: 'NO_CHUNKS',
  };

  for (const chunk of chunks) {
    lastResult = await enqueueAutomationJob({
      brandName: createJob.brandName,
      platform: createJob.platform,
      accountId: createJob.accountId,
      accountName: createJob.accountName,
      sessionId: ctx.sessionId,
      action: 'set_group_photo',
      payload: {
        groups: chunk,
        sourceCreateJobId: createJob.id,
        setPhotoPhase: 'apply',
        photoPath: trimmedPhoto,
        userId: userId ?? undefined,
      },
      storedSessionString: createJob.storedSessionString ?? ctx.storedSessionString,
      expectedPhone: createJob.expectedPhone ?? ctx.expectedPhone,
      delay: ctx.delay,
      allowMultipleQueued: needsSplit,
    });
    if (!lastResult.ok) return lastResult;
  }

  return lastResult;
}
