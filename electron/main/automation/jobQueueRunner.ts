import { isScrapeActiveForSession } from '../scraper/scrapeCancel';
import { isAutoScrapeActiveForSession } from '../scraper/autoScrapeCancel';
import { isSessionSettling, markSessionSettleAfterJob } from './jobQueueSettle';
import { accountJobStepTotal } from './jobQueueBatchHelpers';
import { releaseExecuteSlot, waitForExecuteSlot } from './executeSlotPool';
import { forceReleaseAutomationAccountLock } from './automationAccountLock';
import { runAutomationAction, withAutomationAccountLock } from './index';
import type { AutomationJobRecord } from './jobQueueTypes';
import type { AutomationRunPayload, AutomationRunResult } from './types';
import { runTelegramCreateGroupBatch } from './tgAutomationClient';
import { runWhatsAppCreateGroupBatch } from './waAutomation';
import { withJobTimeoutSettle } from './promiseTimeout';
import {
  countCreatedGroupOutcomes,
  filterGroupsNotDone,
  mergeJobGroupOutcomes,
  resolveCreateResumeSlice,
} from './jobQueueOutcomeHelpers';
import {
  attachJobGroupOutcomes,
  broadcastPostJoinScrape,
  consumeJobStopRequest,
  demoteRunningJobToPaused,
  failStaleRunningJobs,
  getAutomationJobStatus,
  getJobQueueSnapshot,
  getRunnerState,
  hasQueuedReadyAutomationJobs,
  hasRunningAutomationJobs,
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
import { clearScrapeCheckpoint } from '../scraper/scrapeCheckpoint';

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let tickInProgress = false;
let tickPending = false;
/** Watchdog: stale/stall tetap dicek meski antrian kosong (job hung Process N/N). */
let runningWatchdogTimer: ReturnType<typeof setInterval> | null = null;

const STALE_RUNNING_MS = 90 * 60 * 1000;
/** Interval cek job running yang hung — tanpa ini failStale tidak jalan lagi. */
const RUNNING_WATCHDOG_MS = 30_000;

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
  if (msg === 'PARTIAL_BATCH') {
    return 'Partial batch — not all groups succeeded';
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
  return mergeJobGroupOutcomes(
    job.payload.groupOutcomes,
    resultGroupOutcomes(result) ?? resolveCreateGroupOutcomesFromSingle(result, job),
  );
}

function jobToRunPayload(job: AutomationJobRecord): AutomationRunPayload {
  const createResume =
    job.action === 'create_group' ? resolveCreateResumeSlice(job) : null;

  let groups = job.payload.groups;
  if (groups?.length) {
    if (job.action === 'join_by_invite_link') {
      groups = filterGroupsNotDone(groups, job.payload.groupOutcomes, 'join');
    } else if (job.action === 'set_admin') {
      groups = filterGroupsNotDone(groups, job.payload.groupOutcomes, 'set_admin');
    } else if (job.action === 'set_group_photo') {
      groups = filterGroupsNotDone(groups, job.payload.groupOutcomes, 'set_group_photo');
    } else if (
      job.action === 'leave_group' ||
      job.action === 'delete_group' ||
      job.action === 'exit_delete_group'
    ) {
      groups = filterGroupsNotDone(groups, job.payload.groupOutcomes, 'leave');
    }
  }

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
    totalToCreate: createResume
      ? Math.max(0, createResume.remaining)
      : batchTotal(job),
    perRun: Math.max(1, Math.floor(Number(job.payload.perRun) || batchTotal(job))),
    startFrom: createResume
      ? createResume.startFrom
      : Math.max(1, Math.floor(Number(job.payload.startFrom) || 1)),
    useGroupNumbering: job.payload.useGroupNumbering,
    groupNamePrefix: job.payload.groupNamePrefix,
    createGroupSettings: job.payload.createGroupSettings,
    groupId: job.payload.groupId,
    groupLink: job.payload.groupLink,
    targets: job.payload.targets,
    adminRights: job.payload.adminRights,
    inviteLink: job.payload.inviteLink,
    joinSequenceIndex: job.payload.joinSequenceIndex,
    groups,
    leaveDelete: job.payload.leaveDelete,
    photoPath: job.payload.photoPath,
    brandName: job.brandName,
    userId: job.payload.userId,
    jobId: job.id,
  };
}

async function runCreateGroupBatchJob(job: AutomationJobRecord): Promise<AutomationRunResult> {
  const payload = jobToRunPayload(job);
  const resume = resolveCreateResumeSlice(job);
  const onProgress = (current: number, _total: number, label: string) => {
    updateJobProgress(job.id, {
      current: Math.min(resume.alreadyCreated + current, resume.originalTotal),
      total: resume.originalTotal,
      label,
    });
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

function progressOffsetFromOutcomes(job: AutomationJobRecord): number {
  const fromOutcomes = countDoneOutcomesForAction(job.action, job.payload.groupOutcomes);
  if (fromOutcomes > 0) return fromOutcomes;
  return Math.max(0, job.progress?.current ?? 0);
}

function countDoneOutcomesForAction(
  action: AutomationJobRecord['action'],
  outcomes: AutomationJobRecord['payload']['groupOutcomes'] | undefined,
): number {
  if (!outcomes?.length) return 0;
  if (action === 'join_by_invite_link') {
    return outcomes.filter(
      (r) => r.joinStatus === 'joined' || r.joinStatus === 'already_member',
    ).length;
  }
  if (action === 'set_admin') {
    return outcomes.filter((r) => r.adminStatus === 'promoted').length;
  }
  if (action === 'set_group_photo') {
    return outcomes.filter((r) => r.photoStatus === 'set').length;
  }
  if (
    action === 'leave_group' ||
    action === 'delete_group' ||
    action === 'exit_delete_group'
  ) {
    return outcomes.filter((r) => r.exitStatus === 'left').length;
  }
  if (action === 'create_group') {
    return countCreatedGroupOutcomes(outcomes);
  }
  return 0;
}

async function runAccountAutomationJob(job: AutomationJobRecord): Promise<AutomationRunResult> {
  const offset = progressOffsetFromOutcomes(job);
  const stepTotal = accountJobStepTotal(job);
  const onProgress = (current: number, _total: number, label: string) => {
    updateJobProgress(job.id, {
      current: Math.min(offset + current, stepTotal),
      total: stepTotal,
      label,
    });
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
    const createResume =
      job.action === 'create_group' ? resolveCreateResumeSlice(job) : null;
    const progressSeed =
      createResume?.alreadyCreated ??
      (job.action === 'create_group'
        ? countCreatedGroupOutcomes(job.payload.groupOutcomes)
        : Math.max(
            0,
            countDoneOutcomesForAction(job.action, job.payload.groupOutcomes) ||
              (job.progress?.current ?? 0),
          ));

    if (createResume && createResume.remaining <= 0 && createResume.alreadyCreated > 0) {
      markJobFinished(job.id, 'completed', {
        message: `${createResume.alreadyCreated}/${createResume.originalTotal} created`,
        batchSuccess: createResume.alreadyCreated,
        groupOutcomes: job.payload.groupOutcomes,
      });
      tryAutoEnqueueSetPhotoAfterCreate(job);
      return;
    }

    // Join/set_admin/…: semua step sudah done di outcomes — Completed tanpa panggil device lagi.
    if (
      job.action !== 'create_group' &&
      stepTotal > 0 &&
      countDoneOutcomesForAction(job.action, job.payload.groupOutcomes) >= stepTotal
    ) {
      const done = countDoneOutcomesForAction(job.action, job.payload.groupOutcomes);
      markJobFinished(job.id, 'completed', {
        message:
          job.action === 'join_by_invite_link'
            ? `Success ${done} group(s)`
            : `${done}/${stepTotal} done`,
        batchSuccess: done,
        groupOutcomes: job.payload.groupOutcomes,
      });
      if (job.action === 'join_by_invite_link') {
        tryRequestScrapeAfterJoin(job, done);
      }
      return;
    }

    updateJobProgress(job.id, {
      current: Math.min(progressSeed, stepTotal),
      total: stepTotal,
      label: job.payload.groupNamePrefix ?? job.payload.groupName ?? job.accountName,
    });

    const result = batch ? await runCreateGroupBatchJob(job) : await runAccountAutomationJob(job);

    const statusAfter = getAutomationJobStatus(job.id);
    if (statusAfter !== 'running') {
      // Cancel UI sudah set cancelled — persist outcomes supaya VIEW/photo tidak kehilangan grup created.
      const cancelledOutcomes = resolveJobGroupOutcomes(result, job);
      if (cancelledOutcomes?.length) {
        const createdTotal =
          job.action === 'create_group'
            ? countCreatedGroupOutcomes(cancelledOutcomes)
            : batchSuccessCount(result, job) + progressSeed;
        attachJobGroupOutcomes(job.id, {
          message: result.message ?? 'Cancelled',
          groupOutcomes: cancelledOutcomes,
          progressCurrent: Math.min(
            createdTotal,
            job.action === 'create_group' ? batchTotal(job) : stepTotal,
          ),
        });
        tryAutoEnqueueSetPhotoAfterCreate(job);
        clearScrapeCheckpointAfterLeaveDelete(job);
        tryAutoEnqueueDeleteAfterExit(job);
      }
      return;
    }

    const stopMode = consumeJobStopRequest(job.id);
    const timedOut = Boolean(result.errorCode?.endsWith('_TIMEOUT'));
    if (timedOut) {
      const timedOutcomes = resolveJobGroupOutcomes(result, job);
      markJobFinished(job.id, 'failed', {
        message: result.message,
        error: humanizeJobError(result.errorCode ?? 'JOB_TIMEOUT'),
        batchSuccess:
          job.action === 'create_group'
            ? countCreatedGroupOutcomes(timedOutcomes)
            : batchSuccessCount(result, job),
        ...(timedOutcomes ? { groupOutcomes: timedOutcomes } : {}),
      });
      // Partial create tetap bisa lanjut Set Photo — jangan buang grup yang sudah di device.
      tryAutoEnqueueSetPhotoAfterCreate(job);
      clearScrapeCheckpointAfterLeaveDelete(job);
      tryAutoEnqueueDeleteAfterExit(job);
      return;
    }
    if (stopMode === 'cancel') {
      // Race: stop request cancel tapi status belum cancelled — treat seperti cancel UI.
      const cancelledOutcomes = resolveJobGroupOutcomes(result, job);
      if (cancelledOutcomes?.length) {
        attachJobGroupOutcomes(job.id, {
          message: result.message ?? 'Cancelled',
          groupOutcomes: cancelledOutcomes,
          progressCurrent:
            job.action === 'create_group'
              ? countCreatedGroupOutcomes(cancelledOutcomes)
              : batchSuccessCount(result, job) + progressOffsetFromOutcomes(job),
        });
        tryAutoEnqueueSetPhotoAfterCreate(job);
        clearScrapeCheckpointAfterLeaveDelete(job);
        tryAutoEnqueueDeleteAfterExit(job);
      }
      return;
    }
    if (stopMode === 'pause' || result.errorCode === 'JOB_STOPPED') {
      const pausedOutcomes = resolveJobGroupOutcomes(result, job);
      const createdTotal =
        job.action === 'create_group'
          ? countCreatedGroupOutcomes(pausedOutcomes)
          : countDoneOutcomesForAction(job.action, pausedOutcomes) ||
            batchSuccessCount(result, job) + progressOffsetFromOutcomes(job);

      if (
        job.action === 'create_group' &&
        createdTotal >= batchTotal(job) &&
        createdTotal > 0
      ) {
        markJobFinished(job.id, 'completed', {
          message: `${createdTotal}/${batchTotal(job)} created`,
          batchSuccess: createdTotal,
          groupOutcomes: pausedOutcomes,
        });
        tryAutoEnqueueSetPhotoAfterCreate(job);
        return;
      }

      demoteRunningJobToPaused(job.id, {
        message: result.message ?? 'Paused',
        groupOutcomes: pausedOutcomes,
        progressCurrent: Math.min(
          createdTotal,
          job.action === 'create_group' ? batchTotal(job) : stepTotal,
        ),
      });
      return;
    }

    const groupOutcomes = resolveJobGroupOutcomes(result, job);
    const outcomeExtras = groupOutcomes ? { groupOutcomes } : {};
    const success =
      job.action === 'create_group'
        ? countCreatedGroupOutcomes(groupOutcomes)
        : job.action === 'join_by_invite_link' ||
            job.action === 'set_admin' ||
            job.action === 'set_group_photo' ||
            job.action === 'leave_group' ||
            job.action === 'delete_group' ||
            job.action === 'exit_delete_group'
          ? Math.max(
              countDoneOutcomesForAction(job.action, groupOutcomes),
              batchSuccessCount(result, job) + progressOffsetFromOutcomes(job),
            )
          : batchSuccessCount(result, job);
    const total = stepTotal;
    const message =
      job.action === 'create_group'
        ? `${success}/${total} created`
        : (result.message ?? (batch ? `${success}/${total} created` : 'OK'));

    updateJobProgress(job.id, {
      current: Math.min(success, total),
      total,
      label: job.payload.groupName ?? job.accountName,
    });

    const isExitLeave =
      job.action === 'leave_group' && job.payload.exitDeletePhase === 'exit';

    /** Partial batch (create/join/admin/photo/…) jangan Completed hijau — harus Failed + X/Y. */
    const isPartialBatch = total > 0 && success < total;
    const finishCompleted = result.status === 'ok' && !isPartialBatch;

    const successMessage =
      job.action === 'join_by_invite_link'
        ? `Success ${success} group(s)`
        : job.action === 'set_admin'
          ? `Success ${success}/${total} group(s)`
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
                  : message;

    if (finishCompleted) {
      markJobFinished(job.id, 'completed', {
        message: successMessage,
        batchSuccess: success,
        ...outcomeExtras,
      });
      tryAutoEnqueueSetPhotoAfterCreate(job);
      clearScrapeCheckpointAfterLeaveDelete(job);
      tryAutoEnqueueDeleteAfterExit(job);
      tryRequestScrapeAfterJoin(job, success);
      return;
    }

    markJobFinished(job.id, 'failed', {
      message: successMessage,
      batchSuccess: success,
      error: humanizeJobError(
        result.errorCode ??
          (isPartialBatch ? 'PARTIAL_BATCH' : message ?? 'AUTOMATION_ERROR'),
      ),
      ...outcomeExtras,
    });
    tryAutoEnqueueSetPhotoAfterCreate(job);
    clearScrapeCheckpointAfterLeaveDelete(job);
    tryAutoEnqueueDeleteAfterExit(job);
    // Partial join tetap scrape supaya Missing turun untuk yang sudah join.
    tryRequestScrapeAfterJoin(job, success);
  } catch (error) {
    if (getAutomationJobStatus(job.id) === 'running') {
      // Outcomes mid-batch sudah di-attach ke job.payload — jangan buang saat exception.
      const fresh =
        getJobQueueSnapshot().jobs.find((row) => row.id === job.id) ?? job;
      const partialOutcomes = fresh.payload.groupOutcomes;
      const created =
        job.action === 'create_group'
          ? countCreatedGroupOutcomes(partialOutcomes)
          : 0;
      const joined =
        job.action === 'join_by_invite_link'
          ? countDoneOutcomesForAction(job.action, partialOutcomes)
          : 0;
      const partialDone = Math.max(created, joined);
      markJobFinished(job.id, 'failed', {
        error: humanizeJobError(
          error instanceof Error ? error.message : 'AUTOMATION_EXCEPTION',
        ),
        batchSuccess: partialDone > 0 ? partialDone : undefined,
        ...(partialOutcomes?.length ? { groupOutcomes: partialOutcomes } : {}),
        message:
          created > 0
            ? `${created} group(s) created before error`
            : joined > 0
              ? `Success ${joined} group(s) before error`
              : undefined,
      });
      tryAutoEnqueueSetPhotoAfterCreate(job);
      clearScrapeCheckpointAfterLeaveDelete(job);
      tryAutoEnqueueDeleteAfterExit(job);
      tryRequestScrapeAfterJoin(job, joined);
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
    const fresh =
      getJobQueueSnapshot().jobs.find((row) => row.id === job.id) ?? job;
    maybeAutoEnqueueSetPhotoFromCreate(fresh);
  } catch (error) {
    console.error(
      '[jobQueue] auto enqueue set_group_photo failed',
      job.id,
      error instanceof Error ? error.message : error,
    );
  }
}

/** Join sukses → minta renderer scrape akun (lane user) agar daily/master/Missing selaras. */
function tryRequestScrapeAfterJoin(job: AutomationJobRecord, successCount: number): void {
  if (job.action !== 'join_by_invite_link' || successCount <= 0) return;
  try {
    broadcastPostJoinScrape({
      accountId: job.accountId,
      sessionId: job.sessionId,
      platform: job.platform,
      brandName: job.brandName,
    });
  } catch (error) {
    console.error(
      '[jobQueue] post-join scrape request failed',
      job.id,
      error instanceof Error ? error.message : error,
    );
  }
}

function tryAutoEnqueueDeleteAfterExit(job: AutomationJobRecord): void {
  if (job.action !== 'leave_group' || job.payload.exitDeletePhase !== 'exit') return;
  try {
    const fresh =
      getJobQueueSnapshot().jobs.find((row) => row.id === job.id) ?? job;
    maybeAutoEnqueueDeleteFromExit(fresh);
  } catch (error) {
    console.error(
      '[jobQueue] auto enqueue delete_group after leave failed',
      job.id,
      error instanceof Error ? error.message : error,
    );
  }
}

/** Setelah leave/delete massal — buang checkpoint scrape agar daily tidak diisi membership palsu. */
function clearScrapeCheckpointAfterLeaveDelete(job: AutomationJobRecord): void {
  if (
    job.action !== 'leave_group' &&
    job.action !== 'delete_group' &&
    job.action !== 'exit_delete_group'
  ) {
    return;
  }
  const sessionId = job.sessionId?.trim();
  if (!sessionId) return;
  try {
    clearScrapeCheckpoint(sessionId);
  } catch (error) {
    console.warn(
      '[jobQueue] clear scrape checkpoint after leave/delete failed',
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
    ensureRunningJobsWatchdog();

    if (getRunnerState() === 'paused') return;

    const staleFailed = failStaleRunningJobs(STALE_RUNNING_MS);
    if (staleFailed.length > 0) {
      for (const stale of staleFailed) {
        releaseExecuteSlot(stale.accountId);
        forceReleaseAutomationAccountLock(stale.sessionId);
        tryAutoEnqueueSetPhotoAfterCreate(stale);
        clearScrapeCheckpointAfterLeaveDelete(stale);
        tryAutoEnqueueDeleteAfterExit(stale);
      }
      scheduleRunnerTick(0);
    }

    const candidates = pickQueuedJobsForDispatch();
    if (candidates.length === 0) {
      // Queued ada tapi terblokir slot/settle/scrape — tetap retry (jangan diam selamanya).
      if (hasQueuedReadyAutomationJobs()) {
        scheduleRunnerRetry(1500);
      }
      return;
    }

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
    ensureRunningJobsWatchdog();
  }
}

/** Tanpa ini: antrian kosong + job hung → runnerTick berhenti → stale 90m tidak pernah jalan.
 *  Juga: Queued siap tapi slot penuh/settle → harus tetap tick. */
function ensureRunningJobsWatchdog(): void {
  const needs = hasRunningAutomationJobs() || hasQueuedReadyAutomationJobs();
  if (needs && !runningWatchdogTimer) {
    runningWatchdogTimer = setInterval(() => {
      if (!hasRunningAutomationJobs() && !hasQueuedReadyAutomationJobs()) {
        if (runningWatchdogTimer) {
          clearInterval(runningWatchdogTimer);
          runningWatchdogTimer = null;
        }
        return;
      }
      scheduleRunnerTick(0);
    }, RUNNING_WATCHDOG_MS);
  } else if (!needs && runningWatchdogTimer) {
    clearInterval(runningWatchdogTimer);
    runningWatchdogTimer = null;
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
