import { isScrapeActiveForSession } from '../scraper/scrapeCancel';
import { getMaxConcurrentAutomationJobs } from './jobQueueConcurrency';
import { runAutomationAction, withAutomationAccountLock } from './index';
import type { AutomationJobRecord } from './jobQueueTypes';
import type { AutomationRunPayload, AutomationRunResult } from './types';
import { runTelegramCreateGroupBatch } from './tgAutomationClient';
import { runWhatsAppCreateGroupBatch } from './waAutomation';
import {
  broadcastJobQueueChanged,
  consumeJobStopRequest,
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

function batchTotal(job: AutomationJobRecord): number {
  return Math.max(1, Math.floor(Number(job.payload.totalToCreate) || 1));
}

function isCreateGroupBatch(job: AutomationJobRecord): boolean {
  return job.action === 'create_group' && batchTotal(job) > 1;
}

function batchSuccessCount(result: AutomationRunResult): number {
  const raw = result.result?.success;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  const match = result.message?.match(/^(\d+)\/(\d+)\s+created/i);
  return match ? Number(match[1]) : 0;
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

async function runSingleJob(job: AutomationJobRecord): Promise<void> {
  if (!markJobRunning(job.id)) return;

  const batch = isCreateGroupBatch(job);
  if (batch) {
    const total = batchTotal(job);
    updateJobProgress(job.id, {
      current: 0,
      total,
      label: job.payload.groupNamePrefix ?? job.payload.groupName,
    });
  }

  try {
    const result = batch
      ? await runCreateGroupBatchJob(job)
      : await withAutomationAccountLock(job.sessionId, () =>
          runAutomationAction(jobToRunPayload(job)),
        );

    if (consumeJobStopRequest(job.id)) {
      return;
    }

    const success = batch ? batchSuccessCount(result) : 0;
    const total = batch ? batchTotal(job) : 0;
    const message = result.message ?? (batch ? `${success}/${total} created` : 'OK');

    if (result.status === 'ok') {
      if (batch && success < total) {
        markJobFinished(job.id, 'failed', {
          message,
          batchSuccess: success,
          error: message,
        });
        return;
      }
      markJobFinished(job.id, 'completed', {
        message,
        batchSuccess: batch ? success : undefined,
      });
      return;
    }

    markJobFinished(job.id, 'failed', {
      message,
      batchSuccess: batch ? success : undefined,
      error: result.errorCode ?? message ?? 'AUTOMATION_ERROR',
    });
  } catch (error) {
    markJobFinished(job.id, 'failed', {
      error: error instanceof Error ? error.message : 'AUTOMATION_EXCEPTION',
    });
  } finally {
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

    const max = getMaxConcurrentAutomationJobs();
    const slots = max - getRunningJobCount();
    if (slots <= 0) return;

    const candidates = pickQueuedJobsForDispatch(slots);
    if (candidates.length === 0) return;

    let scrapeBlocked = false;
    let dispatched = 0;

    for (const job of candidates) {
      if (isScrapeActiveForSession(job.sessionId)) {
        scrapeBlocked = true;
        continue;
      }
      dispatched += 1;
      void runSingleJob(job);
    }

    if (scrapeBlocked && dispatched === 0) {
      scheduleRunnerRetry(3000);
    } else if (scrapeBlocked) {
      scheduleRunnerRetry(3000);
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

export function notifyRunnerStateChanged(): void {
  broadcastJobQueueChanged();
  scheduleRunnerTick(0);
}

