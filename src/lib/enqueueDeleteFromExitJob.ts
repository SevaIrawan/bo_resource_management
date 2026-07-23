import { buildAutomationJobRunContext } from '@/lib/automationJobRunContext';
import { enqueueAutomationJob } from '@/lib/automationJobQueueClient';
import { accountRowFromAutomationJob } from '@/lib/accountRowFromAutomationJob';
import { resolveLeftGroupsFromExitJob } from '@/lib/exitDeleteFlow';
import {
  readTelegramWorkerSettings,
  readWhatsAppWorkerSettings,
  toLeaveDeleteJobPayload,
} from '@/config/workerPlatformSettings';
import type { AutomationJobRecord } from '@/types/automationJob';

/** Delete hanya grup yang exitStatus=left di VIEW result job exit — bukan dari SETUP. */
export async function enqueueDeleteFromExitJob(
  exitJob: AutomationJobRecord,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const allGroups = resolveLeftGroupsFromExitJob(exitJob);
  if (allGroups.length === 0) return { ok: false, error: 'NO_LEFT_GROUPS' };

  const workerSettings =
    exitJob.platform === 'telegram'
      ? readTelegramWorkerSettings()
      : readWhatsAppWorkerSettings();

  if (!workerSettings.leaveDelete.deleteEnabled) {
    return { ok: false, error: 'DELETE_DISABLED' };
  }

  const maxPerRun = Math.max(1, workerSettings.inviteLink.maxPerRun || 30);
  const account = accountRowFromAutomationJob(exitJob);
  const ctx = await buildAutomationJobRunContext(account, 'delete_group');

  const chunks: Array<typeof allGroups> = [];
  for (let i = 0; i < allGroups.length; i += maxPerRun) {
    chunks.push(allGroups.slice(i, i + maxPerRun));
  }

  const needsSplit = chunks.length > 1;
  let lastResult: { ok: true; jobId: string } | { ok: false; error: string } = {
    ok: false,
    error: 'NO_CHUNKS',
  };

  /** Delete chat lokal akun ini saja (WA wipe / TG delete_dialog) — bukan dissolve. */
  const leaveDelete = {
    ...toLeaveDeleteJobPayload(workerSettings),
    requireOwnerForDelete: false,
  };

  for (const chunk of chunks) {
    lastResult = await enqueueAutomationJob({
      brandName: exitJob.brandName,
      platform: exitJob.platform,
      accountId: exitJob.accountId,
      accountName: exitJob.accountName,
      sessionId: ctx.sessionId,
      action: 'delete_group',
      payload: {
        groups: chunk,
        sourceExitJobId: exitJob.id,
        exitDeletePhase: 'delete',
        leaveDelete,
      },
      storedSessionString: exitJob.storedSessionString ?? ctx.storedSessionString,
      expectedPhone: exitJob.expectedPhone ?? ctx.expectedPhone,
      delay: ctx.delay,
      allowMultipleQueued: needsSplit,
    });
    if (!lastResult.ok) return lastResult;
  }

  return lastResult;
}
