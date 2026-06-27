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
  const groups = resolveLeftGroupsFromExitJob(exitJob);
  if (groups.length === 0) return { ok: false, error: 'NO_LEFT_GROUPS' };

  const workerSettings =
    exitJob.platform === 'telegram'
      ? readTelegramWorkerSettings()
      : readWhatsAppWorkerSettings();

  if (!workerSettings.leaveDelete.deleteEnabled) {
    return { ok: false, error: 'DELETE_DISABLED' };
  }

  const account = accountRowFromAutomationJob(exitJob);
  const ctx = await buildAutomationJobRunContext(account, 'delete_group');

  return enqueueAutomationJob({
    brandName: exitJob.brandName,
    platform: exitJob.platform,
    accountId: exitJob.accountId,
    accountName: exitJob.accountName,
    sessionId: ctx.sessionId,
    action: 'delete_group',
    payload: {
      groups,
      sourceExitJobId: exitJob.id,
      exitDeletePhase: 'delete',
      leaveDelete: toLeaveDeleteJobPayload(workerSettings),
    },
    storedSessionString: exitJob.storedSessionString ?? ctx.storedSessionString,
    expectedPhone: exitJob.expectedPhone ?? ctx.expectedPhone,
    delay: ctx.delay,
  });
}
