import { isScrapeActiveForSession } from '../scraper/scrapeCancel';
import { isAutoScrapeActiveForSession } from '../scraper/autoScrapeCancel';
import { isSessionSettling, markSessionSettleAfterJob } from './jobQueueSettle';
import { accountJobStepTotal } from './jobQueueBatchHelpers';
import { runAutomationAction, withAutomationAccountLock } from './index';
import type { AutomationJobRecord } from './jobQueueTypes';
import type { AutomationRunPayload, AutomationRunResult } from './types';
import { runTelegramCreateGroupBatch } from './tgAutomationClient';
import { runWhatsAppCreateGroupBatch } from './waAutomation';
import { withJobTimeout } from './promiseTimeout';
import {
  releaseExecuteSlot,
  waitForExecuteSlot,
} from './executeSlotPool';
import {
  broadcastJobQueueChanged,
  consumeJobStopRequest,
  failStaleRunningJobs,
  countFreeExecuteSlots,
  getRunningJobCount,
  getRunnerState,
  markJobFinished,
  markJobRunning,
  pickQueuedJobsForDispatch,
  updateJobProgress,
} from './jobQueueStore';
import { getMaxConcurrentAutomationJobs } from './jobQueueConcurrency';

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let tickInProgress = false;
let tickPending = false;

const STALE_RUNNING_MS = 90 * 60 * 1000;

const JOB_TIMEOUT_BASE_MS: Record<string, number> = {
  join_by_invite_link: 20 * 60 * 1000,
  set_admin: 25 * 60 * 1000,
  leave_group: 25 * 60 * 1000,
  delete_group: 25 * 60 * 1000,
  set_group_photo: 35 * 60 * 1000,
  exit_delete_group: 35 * 60 * 1000,
  create_group: 90 * 60 * 1000,
};

const JOB_TIMEOUT_PER_STEP_MS = 5 * 60 * 1000;

function batchTotal(job: AutomationJobRecord): number {
  return Math.max(1, Math.floor(Number(job.payload.totalToCreate) || 1));
}

function isCreateGroupBatch(job: AutomationJobRecord): boolean {
  return job.action === 'create_group' && batchTotal(job) > 1;
}

function jobTimeoutMs(job: AutomationJobRecord): number {
  const steps = accountJobStepTotal(job);
  const base = JOB_TIMEOUT_BASE_MS[job.action] ?? 20 * 60 * 1000;
  return Math.max(base, steps * JOB_TIMEOUT_PER_STEP_MS);
}

function batchSuccessCount(result: AutomationRunResult, job: AutomationJobRecord): number {
  const raw = result.result?.success;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);

  const joined = result.message?.match(/^(\d+)\/(\d+)\s+joined/i);
  if (joined) return Number(joined[1]);

  const promoted = result.message?.match(/Promoted\s+(\d+)/i);
  if (promoted) return Number(promoted[1]);

  const created = result.message?.match(/^(\d+)\/(\d+)\s+created/i);
  if (created) return Number(created[1]);

  const left = result.message?.match(/^Left\s+(\d+)/i);
  if (left) return Number(left[1]);

  const exited = result.message?.match(/^Exited\s+(\d+)/i);
  if (exited) return Number(exited[1]);

  const photo = result.message?.match(/^Set photo\s+(\d+)/i);
  if (photo) return Number(photo[1]);

  if (result.status === 'ok' && job.action !== 'create_group') {
    return accountJobStepTotal(job);
  }
  return 0;
}

function resultGroupOutcomes(
  result: AutomationRunResult,
): AutomationJobRecord['payload']['groupOutcomes'] | undefined {
  const raw = result.result?.groupOutcomes;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw as AutomationJobRecord['payload']['groupOutcomes'];
}

function resolveCreateGroupOutcomesFromSingle(
  result: AutomationRunResult,
  job: AutomationJobRecord,
): AutomationJobRecord['payload']['groupOutcomes'] | undefined {
  if (job.action !== 'create_group' || result.status !== 'ok') return undefined;
  const detail = result.result ?? {};
  const groupId = String(detail.group_id ?? '').trim();
  if (!groupId) return undefined;
  const groupName =
    String(detail.group_name ?? job.payload.groupName ?? '').trim() || groupId;
  return [
    {
      groupId,
      groupName,
      inviteLink: typeof detail.invite_link === 'string' ? detail.invite_link : undefined,
      createStatus: 'created',
    },
  ];
}

function resolveJobGroupOutcomes(
  result: AutomationRunResult,
  job: AutomationJobRecord,
): AutomationJobRecord['payload']['groupOutcomes'] | undefined {
  return resultGroupOutcomes(result) ?? resolveCreateGroupOutcomesFromSingle(result, job);
}

function jobToRunPayload(job: AutomationJobRecord): AutomationRunPayload {
  return {
    sessionId: job.sessionId,
    platform: job.platform,
    action: job.action,
    storedSessionString: job.storedSessionString ?? null,
    expectedPhone: job.expectedPhone,
    delay: job.delay,
    groupName: job.payload.groupName,
    description: job.payload.description,
    hideChatHistory: job.payload.hideChatHistory,
    initialParticipants: job.payload.initialParticipants,
    batchIndex: job.payload.batchIndex,
    totalToCreate: batchTotal(job),
    perRun: Math.max(1, Math.floor(Number(job.payload.perRun) || batchTotal(job))),
    startFrom: Math.max(1, Math.floor(Number(job.payload.startFrom) || 1)),
    useGroupNumbering: job.payload.useGroupNumbering,
    groupNamePrefix: job.payload.groupNamePrefix,
    createGroupSettings: job.payload.createGroupSettings,
    groupId: job.payload.groupId,
    groupLink: job.payload.groupLink,
    targets: job.payload.targets,
    adminRights: job.payload.adminRights,
    inviteLink: job.payload.inviteLink,
    joinSequenceIndex: job.payload.joinSequenceIndex,
    groups: job.payload.groups,
    leaveDelete: job.payload.leaveDelete,
    photoPath: job.payload.photoPath,
    brandName: job.brandName,
    userId: job.payload.userId,
    jobId: job.id,
  };
}

async function runCreateGroupBatchJob(job: AutomationJobRecord): Promise<AutomationRunResult> {
  const payload = jobToRunPayload(job);
  const onProgress = (current: number, total: number, label: string) => {
    updateJobProgress(job.id, { current, total, label });
  };

  return withJobTimeout(
    withAutomationAccountLock(job.sessionId, async () => {
      if (job.platform === 'telegram') {
        return runTelegramCreateGroupBatch(payload, onProgress);
      }
      return runWhatsAppCreateGroupBatch(payload, onProgress);
    }),
    jobTimeoutMs(job),
    job.action,
  );
}

async function runAccountAutomationJob(job: AutomationJobRecord): Promise<AutomationRunResult> {
  const onProgress = (current: number, total: number, label: string) => {
    updateJobProgress(job.id, { current, total, label });
  };

  return withJobTimeout(
    runAutomationAction(jobToRunPayload(job), onProgress),
    jobTimeoutMs(job),
    job.action,
  );
}

async function runSingleJob(job: AutomationJobRecord): Promise<void> {
  try {
    await waitForExecuteSlot(job.accountId, 'job');
  } catch {
    scheduleRunnerRetry(1000);
    return;
  }

  if (!markJobRunning(job.id)) {
    releaseExecuteSlot(job.accountId);
    return;
  }

  const batch = isCreateGroupBatch(job);
  const stepTotal = accountJobStepTotal(job);
  updateJobProgress(job.id, {
    current: 0,
    total: stepTotal,
    label: job.payload.groupNamePrefix ?? job.payload.groupName ?? job.accountName,
  });

  try {
    const result = batch ? await runCreateGroupBatchJob(job) : await runAccountAutomationJob(job);

    if (consumeJobStopRequest(job.id) || result.errorCode === 'JOB_STOPPED') {
      return;
    }

    const success = batchSuccessCount(result, job);
    const total = stepTotal;
    const message = result.message ?? (batch ? `${success}/${total} created` : 'OK');

    updateJobProgress(job.id, {
      current: success,
      total,
      label: job.payload.groupName ?? job.accountName,
    });

    const groupOutcomes = resolveJobGroupOutcomes(result, job);
    const outcomeExtras = groupOutcomes ? { groupOutcomes } : {};
    const isExitLeave =
      job.action === 'leave_group' && job.payload.exitDeletePhase === 'exit';

    if (result.status === 'ok') {
      if (
        success < total &&
        !isExitLeave &&
        (job.action === 'join_by_invite_link' ||
          job.action === 'set_admin' ||
          job.action === 'set_group_photo' ||
          job.action === 'leave_group' ||
          job.action === 'delete_group' ||
          job.action === 'exit_delete_group')
      ) {
        markJobFinished(job.id, 'failed', {
          message,
          batchSuccess: success,
          error: message,
          ...outcomeExtras,
        });
        return;
      }
      if (batch && success < total) {
        markJobFinished(job.id, 'failed', {
          message,
          batchSuccess: success,
          error: message,
          ...outcomeExtras,
        });
        return;
      }
      markJobFinished(job.id, 'completed', {
        message:
          job.action === 'join_by_invite_link'
            ? `Success ${success} group(s)`
            : job.action === 'set_admin'
              ? `Success ${success} group(s)`
              : job.action === 'leave_group'
                ? isExitLeave
                  ? `Left ${success}/${total} group(s)`
                  : `Success ${success} group(s)`
                : job.action === 'delete_group'
                  ? `Deleted ${success}/${total} group(s)`
                  : job.action === 'set_group_photo'
                    ? `Set photo ${success}/${total} group(s)`
                    : job.action === 'exit_delete_group'
                    ? `Exited ${success} group(s)`
                    : message,
        batchSuccess: success,
        ...outcomeExtras,
      });
      return;
    }

    markJobFinished(job.id, 'failed', {
      message,
      batchSuccess: success,
      error: result.errorCode ?? message ?? 'AUTOMATION_ERROR',
      ...outcomeExtras,
    });
  } catch (error) {
    markJobFinished(job.id, 'failed', {
      error: error instanceof Error ? error.message : 'AUTOMATION_EXCEPTION',
    });
  } finally {
    markSessionSettleAfterJob(job.sessionId);
    releaseExecuteSlot(job.accountId);
    scheduleRunnerTick(0);
  }
}

async function runnerTick(): Promise<void> {
  if (tickInProgress) {
    tickPending = true;
    return;
  }

  tickInProgress = true;
  try {
    if (getRunnerState() === 'paused') return;

    if (failStaleRunningJobs(STALE_RUNNING_MS) > 0) {
      scheduleRunnerTick(0);
    }

    const maxConcurrent = getMaxConcurrentAutomationJobs();
    const running = getRunningJobCount();
    const freeSlots = countFreeExecuteSlots();
    const available = Math.min(maxConcurrent - running, freeSlots);
    if (available <= 0) return;

    const candidates = pickQueuedJobsForDispatch(available);
    if (candidates.length === 0) return;

    for (const job of candidates) {
      if (
        isScrapeActiveForSession(job.sessionId) ||
        isAutoScrapeActiveForSession(job.sessionId)
      ) {
        scheduleRunnerRetry(1500);
        continue;
      }
      if (isSessionSettling(job.sessionId)) {
        scheduleRunnerRetry(1000);
        continue;
      }
      void runSingleJob(job);
    }
  } finally {
    tickInProgress = false;
    if (tickPending) {
      tickPending = false;
      void runnerTick();
    }
  }
}

function scheduleRunnerRetry(ms: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    scheduleRunnerTick(0);
  }, ms);
}

export function scheduleRunnerTick(delayMs = 0): void {
  if (delayMs > 0) {
    setTimeout(() => void runnerTick(), delayMs);
    return;
  }
  void runnerTick();
}
