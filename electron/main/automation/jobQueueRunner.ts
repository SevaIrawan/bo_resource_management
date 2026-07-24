import { isScrapeActiveForSession } from '../scraper/scrapeCancel';
import { isAutoScrapeActiveForSession } from '../scraper/autoScrapeCancel';
import { isSessionSettling, markSessionSettleAfterJob } from './jobQueueSettle';
import { accountJobStepTotal } from './jobQueueBatchHelpers';
import { runAutomationAction, withAutomationAccountLock } from './index';
import type { AutomationJobRecord } from './jobQueueTypes';
import type { AutomationRunPayload, AutomationRunResult } from './types';
import { runTelegramCreateGroupBatch } from './tgAutomationClient';
import { runWhatsAppCreateGroupBatch } from './waAutomation';
import { withJobTimeoutSettle } from './promiseTimeout';
import {
  releaseExecuteSlot,
  waitForExecuteSlot,
} from './executeSlotPool';
import {
  consumeJobStopRequest,
  demoteRunningJobToPaused,
  failStaleRunningJobs,
  getAutomationJobStatus,
  getRunnerState,
  markJobFinished,
  markJobRunning,
  peekJobStopRequest,
  pickQueuedJobsForDispatch,
  releaseClaimedJobToQueue,
  signalJobStop,
  updateJobProgress,
} from './jobQueueStore';
import { maybeAutoEnqueueSetPhotoFromCreate } from './autoEnqueueSetPhotoFromCreate';
import { maybeAutoEnqueueDeleteFromExit } from './autoEnqueueDeleteFromExit';

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

/** WA Web evaluate flake sering jadi Error message "r" — jangan tampilkan mentah di UI. */
function humanizeJobError(raw: string): string {
  const msg = raw.trim();
  if (!msg) return 'AUTOMATION_ERROR';
  if (msg.length <= 3 || /^r(:\s*r)?$/i.test(msg)) {
    return 'WhatsApp store flake (getChatById) — retry the job';
  }
  return msg;
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

  const settled = await withJobTimeoutSettle(
    withAutomationAccountLock(job.sessionId, async () => {
      if (job.platform === 'telegram') {
        return runTelegramCreateGroupBatch(payload, onProgress);
      }
      return runWhatsAppCreateGroupBatch(payload, onProgress);
    }),
    jobTimeoutMs(job),
    () => signalJobStop(job.id, 'cancel'),
  );

  if (settled.timedOut) {
    return {
      status: 'error',
      action: job.action,
      message: `JOB_${job.action}_TIMEOUT`,
      errorCode: `JOB_${job.action}_TIMEOUT`,
      result: settled.value?.result,
    };
  }
  return settled.value!;
}

async function runAccountAutomationJob(job: AutomationJobRecord): Promise<AutomationRunResult> {
  const onProgress = (current: number, total: number, label: string) => {
    updateJobProgress(job.id, { current, total, label });
  };

  const settled = await withJobTimeoutSettle(
    runAutomationAction(jobToRunPayload(job), onProgress),
    jobTimeoutMs(job),
    () => signalJobStop(job.id, 'cancel'),
  );

  if (settled.timedOut) {
    return {
      status: 'error',
      action: job.action,
      message: `JOB_${job.action}_TIMEOUT`,
      errorCode: `JOB_${job.action}_TIMEOUT`,
      result: settled.value && typeof settled.value === 'object' && 'result' in settled.value
        ? (settled.value as AutomationRunResult).result
        : undefined,
    };
  }
  return settled.value!;
}

/**
 * Claim running dulu (anti double-dispatch), baru tunggu execute slot.
 * Pause/cancel cooperative; timeout signal stop lalu tunggu settle sebelum lepas slot.
 */
async function runSingleJob(job: AutomationJobRecord): Promise<void> {
  if (!markJobRunning(job.id)) {
    return;
  }

  let slotHeld = false;
  try {
    try {
      await waitForExecuteSlot(job.accountId, 'job', job.platform);
      slotHeld = true;
    } catch {
      releaseClaimedJobToQueue(job.id);
      scheduleRunnerRetry(1000);
      return;
    }

    if (getAutomationJobStatus(job.id) !== 'running') {
      // Cancel saat menunggu slot — status sudah cancelled.
      return;
    }

    const stopBeforeRun = peekJobStopRequest(job.id);
    if (stopBeforeRun === 'cancel') {
      consumeJobStopRequest(job.id);
      return;
    }
    if (stopBeforeRun === 'pause') {
      demoteRunningJobToPaused(job.id);
      return;
    }

    const batch = isCreateGroupBatch(job);
    const stepTotal = accountJobStepTotal(job);
    updateJobProgress(job.id, {
      current: 0,
      total: stepTotal,
      label: job.payload.groupNamePrefix ?? job.payload.groupName ?? job.accountName,
    });

    const result = batch ? await runCreateGroupBatchJob(job) : await runAccountAutomationJob(job);

    if (getAutomationJobStatus(job.id) !== 'running') {
      return;
    }

    const stopMode = consumeJobStopRequest(job.id);
    const timedOut = Boolean(result.errorCode?.endsWith('_TIMEOUT'));
    if (timedOut) {
      markJobFinished(job.id, 'failed', {
        message: result.message,
        error: humanizeJobError(result.errorCode ?? 'JOB_TIMEOUT'),
        batchSuccess: batchSuccessCount(result, job),
        ...(resolveJobGroupOutcomes(result, job)
          ? { groupOutcomes: resolveJobGroupOutcomes(result, job) }
          : {}),
      });
      return;
    }
    if (stopMode === 'cancel') {
      return;
    }
    if (stopMode === 'pause' || result.errorCode === 'JOB_STOPPED') {
      demoteRunningJobToPaused(job.id);
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
      // Partial batch (create/join/admin/…) tetap completed jika device ada yang sukses.
      // success === 0 + status ok tidak diharapkan; tetap completed dengan message.
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
      tryAutoEnqueueSetPhotoAfterCreate(job);
      tryAutoEnqueueDeleteAfterExit(job);
      return;
    }

    markJobFinished(job.id, 'failed', {
      message,
      batchSuccess: success,
      error: humanizeJobError(result.errorCode ?? message ?? 'AUTOMATION_ERROR'),
      ...outcomeExtras,
    });
    tryAutoEnqueueSetPhotoAfterCreate(job);
    tryAutoEnqueueDeleteAfterExit(job);
  } catch (error) {
    if (getAutomationJobStatus(job.id) === 'running') {
      markJobFinished(job.id, 'failed', {
        error: humanizeJobError(
          error instanceof Error ? error.message : 'AUTOMATION_EXCEPTION',
        ),
      });
    }
  } finally {
    markSessionSettleAfterJob(job.sessionId);
    if (slotHeld) {
      releaseExecuteSlot(job.accountId);
    }
    scheduleRunnerTick(0);
  }
}

function tryAutoEnqueueSetPhotoAfterCreate(job: AutomationJobRecord): void {
  if (job.action !== 'create_group') return;
  try {
    maybeAutoEnqueueSetPhotoFromCreate(job);
  } catch (error) {
    console.error(
      '[jobQueue] auto enqueue set_group_photo failed',
      job.id,
      error instanceof Error ? error.message : error,
    );
  }
}

function tryAutoEnqueueDeleteAfterExit(job: AutomationJobRecord): void {
  if (job.action !== 'leave_group' || job.payload.exitDeletePhase !== 'exit') return;
  try {
    maybeAutoEnqueueDeleteFromExit(job);
  } catch (error) {
    console.error(
      '[jobQueue] auto enqueue delete_group after leave failed',
      job.id,
      error instanceof Error ? error.message : error,
    );
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

    const candidates = pickQueuedJobsForDispatch();
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
