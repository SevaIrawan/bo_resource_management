import { buildAutomationJobRunContext } from '@/lib/automationJobRunContext';
import { enqueueAutomationJob } from '@/lib/automationJobQueueClient';
import { resolveLeftGroupsFromExitJob } from '@/lib/exitDeleteFlow';
import {
  readTelegramWorkerSettings,
  readWhatsAppWorkerSettings,
  toLeaveDeleteJobPayload,
} from '@/config/workerPlatformSettings';
import type { AutomationJobRecord } from '@/types/automationJob';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

function accountRowFromExitJob(job: AutomationJobRecord): AccountBrandRow {
  return {
    id: job.accountId,
    accountName: job.accountName,
    platform: job.platform,
    phoneNumber: job.expectedPhone ?? '',
    brandName: job.brandName,
    status: 'active',
    groupsCurrent: 0,
    groupsTotal: 0,
    joinedInMaster: 0,
    adminCurrent: 0,
    adminTotal: 0,
    sessionStatus: 'valid',
    actionProcess: null,
    syncState: 'synced',
    isMisaligned: false,
    lastSyncAt: null,
  };
}

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

  const account = accountRowFromExitJob(exitJob);
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
