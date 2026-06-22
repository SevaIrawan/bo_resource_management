import { isScrapeActiveForSession, isGlobalScrapeInFlight } from '../scraper/scrapeCancel';
import { isSessionSettling, markSessionSettleAfterJob } from './jobQueueSettle';
import { accountJobStepTotal } from './jobQueueBatchHelpers';
import { runAutomationAction, withAutomationAccountLock } from './index';
import type { AutomationJobRecord } from './jobQueueTypes';
import type { AutomationRunPayload, AutomationRunResult } from './types';
import { runTelegramCreateGroupBatch } from './tgAutomationClient';
import { runWhatsAppCreateGroupBatch } from './waAutomation';
import { withJobTimeout } from './promiseTimeout';
import {
  broadcastJobQueueChanged,
  consumeJobStopRequest,
  failStaleRunningJobs,
  getRunningJobCount,
  getRunnerState,
  markJobFinished,
  markJobRunning,
  pickQueuedJobsForDispatch,
  updateJobProgress,
} from './jobQueueStore';

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let tickInProgress = false;
let tickPending = false;

/** Jeda antar akun di antrian (user spec: 60s). */
const BETWEEN_ACCOUNT_DELAY_MS = 60_000;

const STALE_RUNNING_MS = 30 * 60 * 1000;

const JOB_TIMEOUT_BASE_MS: Record<string, number> = {
  join_by_invite_link: 20 * 60 * 1000,
  set_admin: 25 * 60 * 1000,
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

  if (result.status === 'ok' && job.action !== 'create_group') {
    return accountJobStepTotal(job);
  }
  return 0;
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
    groupNamePrefix: job.payload.groupNamePrefix,
    createGroupSettings: job.payload.createGroupSettings,
    groupId: job.payload.groupId,
    groupLink: job.payload.groupLink,
    targets: job.payload.targets,
    adminRights: job.payload.adminRights,
    inviteLink: job.payload.inviteLink,
    joinSequenceIndex: job.payload.joinSequenceIndex,
    groups: job.payload.groups,
  };
}

async function runCreateGroupBatchJob(job: AutomationJobRecord): Promise<AutomationRunResult> {
  const payload = jobToRunPayload(job);
  const onProgress = (current: number, total: number, label: string) => {
    updateJobProgress(job.id, { current, total, label });
  };

  return withAutomationAccountLock(job.sessionId, async () => {
    if (job.platform === 'telegram') {
      return runTelegramCreateGroupBatch(payload, onProgress);
    }
    return runWhatsAppCreateGroupBatch(payload, onProgress);
  });
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
  if (!markJobRunning(job.id)) return;

  const batch = isCreateGroupBatch(job);
  const stepTotal = accountJobStepTotal(job);
  updateJobProgress(job.id, {
    current: 0,
    total: stepTotal,
    label: job.payload.groupNamePrefix ?? job.payload.groupName ?? job.accountName,
  });

  let finishedRun = false;

  try {
    const result = batch ? await runCreateGroupBatchJob(job) : await runAccountAutomationJob(job);

    if (consumeJobStopRequest(job.id)) {
      return;
    }

    finishedRun = true;
    const success = batchSuccessCount(result, job);
    const total = stepTotal;
    const message = result.message ?? (batch ? `${success}/${total} created` : 'OK');

    updateJobProgress(job.id, {
      current: success,
      total,
      label: job.payload.groupName ?? job.accountName,
    });

    if (result.status === 'ok') {
      if (success < total && (job.action === 'join_by_invite_link' || job.action === 'set_admin')) {
        markJobFinished(job.id, 'failed', {
          message,
          batchSuccess: success,
          error: message,
        });
        return;
      }
      if (batch && success < total) {
        markJobFinished(job.id, 'failed', {
          message,
          batchSuccess: success,
          error: message,
        });
        return;
      }
      markJobFinished(job.id, 'completed', {
        message:
          job.action === 'join_by_invite_link'
            ? `Success ${success} group(s)`
            : job.action === 'set_admin'
              ? `Success ${success} group(s)`
              : message,
        batchSuccess: success,
      });
      return;
    }

    markJobFinished(job.id, 'failed', {
      message,
      batchSuccess: success,
      error: result.errorCode ?? message ?? 'AUTOMATION_ERROR',
    });
  } catch (error) {
    finishedRun = true;
    markJobFinished(job.id, 'failed', {
      error: error instanceof Error ? error.message : 'AUTOMATION_EXCEPTION',
    });
  } finally {
    markSessionSettleAfterJob(job.sessionId);
    scheduleRunnerTick(finishedRun ? BETWEEN_ACCOUNT_DELAY_MS : 0);
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

    if (getRunningJobCount() > 0) return;

    const candidates = pickQueuedJobsForDispatch(1);
    if (candidates.length === 0) return;

    const job = candidates[0];
    if (isGlobalScrapeInFlight()) {
      scheduleRunnerRetry(3000);
      return;
    }
    if (isSessionSettling(job.sessionId)) {
      scheduleRunnerRetry(1000);
      return;
    }
    if (isScrapeActiveForSession(job.sessionId)) {
      scheduleRunnerRetry(3000);
      return;
    }

    void runSingleJob(job);
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

export function notifyRunnerStateChanged(): void {
  broadcastJobQueueChanged();
  scheduleRunnerTick(0);
}
