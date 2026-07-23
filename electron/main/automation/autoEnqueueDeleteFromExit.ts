import {
  enqueueAutomationJob,
  getJobQueueSnapshot,
} from './jobQueueStore';
import type { AutomationJobRecord } from './jobQueueTypes';

const DEFAULT_DELETE_MAX_PER_RUN = 30;

function resolveLeftGroups(exitJob: AutomationJobRecord) {
  const outcomes = exitJob.payload.groupOutcomes;
  if (outcomes?.length) {
    return outcomes
      .filter((row) => row.exitStatus === 'left' && row.groupId.trim().length > 0)
      .map((row) => ({
        groupId: row.groupId,
        groupName: row.groupName,
        inviteLink: row.inviteLink,
        groupLink: row.groupLink,
      }));
  }

  const groups = exitJob.payload.groups ?? [];
  const leftCount = Math.max(0, exitJob.progress?.current ?? 0);
  return groups.slice(0, leftCount).map((group) => ({
    groupId: group.groupId,
    groupName: group.groupName,
    inviteLink: group.inviteLink,
    groupLink: group.groupLink,
  }));
}

function hasDeleteFollowUp(exitJobId: string): boolean {
  const jobs = getJobQueueSnapshot().jobs;
  return jobs.some((job) => {
    if (job.action !== 'delete_group') return false;
    if (job.payload.sourceExitJobId !== exitJobId) return false;
    if (job.status === 'queued' || job.status === 'running' || job.status === 'completed') {
      return true;
    }
    return job.status === 'failed' && (job.progress?.current ?? 0) > 0;
  });
}

/**
 * Setelah leave_group (phase exit) selesai: auto-enqueue delete_group
 * hanya untuk grup exitStatus=left. Delete = chat lokal akun yang sama
 * (WA wipe / TG delete_dialog) — bukan bubarkan grup.
 */
export function maybeAutoEnqueueDeleteFromExit(exitJob: AutomationJobRecord): void {
  if (exitJob.action !== 'leave_group') return;
  if (exitJob.payload.exitDeletePhase !== 'exit') return;
  if (exitJob.status !== 'completed' && exitJob.status !== 'failed') return;

  const groups = resolveLeftGroups(exitJob);
  if (groups.length === 0) return;
  if (hasDeleteFollowUp(exitJob.id)) return;

  const leaveDelete = {
    clearChatHistoryOnDelete: exitJob.payload.leaveDelete?.clearChatHistoryOnDelete === true,
    /** Path chat lokal per akun — bukan DeleteChannel / dissolve. */
    requireOwnerForDelete: false,
  };

  const maxPerRun = DEFAULT_DELETE_MAX_PER_RUN;
  const chunks: Array<typeof groups> = [];
  for (let i = 0; i < groups.length; i += maxPerRun) {
    chunks.push(groups.slice(i, i + maxPerRun));
  }

  const needsSplit = chunks.length > 1;
  for (const chunk of chunks) {
    enqueueAutomationJob({
      brandName: exitJob.brandName,
      platform: exitJob.platform,
      accountId: exitJob.accountId,
      accountName: exitJob.accountName,
      sessionId: exitJob.sessionId,
      action: 'delete_group',
      payload: {
        groups: chunk,
        sourceExitJobId: exitJob.id,
        exitDeletePhase: 'delete',
        leaveDelete,
      },
      storedSessionString: exitJob.storedSessionString ?? null,
      expectedPhone: exitJob.expectedPhone,
      delay: exitJob.delay,
      allowMultipleQueued: needsSplit,
    });
  }
}
