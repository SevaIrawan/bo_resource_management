import { app, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getMaxConcurrentAutomationJobs } from './jobQueueConcurrency';
import { getExecuteSlotStats } from './executeSlotPool';
import { accountJobStepTotal, isJobQueueBlockingExecutes, listBusyAccountIds } from './jobQueueBatchHelpers';
import { listSettlingSessionIds, markSessionSettleAfterJob } from './jobQueueSettle';
import { getActiveScrapeSessionCount, isScrapeActiveForSession, listActiveScrapeSessionIds } from '../scraper/scrapeCancel';
import { getActiveAutoScrapeSessionCount, isAutoScrapeActiveForSession, listActiveAutoScrapeSessionIds } from '../scraper/autoScrapeCancel';
import type {
  AutomationJobEnqueueInput,
  AutomationJobListFilter,
  AutomationJobQueueSnapshot,
  AutomationJobRecord,
  AutomationJobRunnerState,
  AutomationJobStatus,
  PersistedQueueState,
} from './jobQueueTypes';

let jobs: AutomationJobRecord[] = [];
let runnerPaused = false;
let loaded = false;
const jobStopRequests = new Map<string, 'cancel' | 'pause'>();

function requestJobStop(jobId: string, mode: 'cancel' | 'pause'): void {
  jobStopRequests.set(jobId, mode);
}

export function consumeJobStopRequest(jobId: string): 'cancel' | 'pause' | null {
  const mode = jobStopRequests.get(jobId);
  if (mode) jobStopRequests.delete(jobId);
  return mode ?? null;
}

/** Cek stop tanpa consume — dipakai loop automation cooperative cancel. */
export function peekJobStopRequest(jobId: string): 'cancel' | 'pause' | null {
  return jobStopRequests.get(jobId) ?? null;
}

function queueFilePath(): string {
  return path.join(app.getPath('userData'), 'automation-job-queue.json');
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = fs.readFileSync(queueFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as PersistedQueueState;
    jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    runnerPaused = Boolean(parsed.runnerPaused);
    for (const job of jobs) {
      if (job.status === 'running') {
        job.status = 'queued';
        delete job.startedAt;
      }
    }
  } catch {
    jobs = [];
    runnerPaused = false;
  }
}

function persist(): void {
  const payload: PersistedQueueState = { jobs, runnerPaused };
  fs.mkdirSync(path.dirname(queueFilePath()), { recursive: true });
  fs.writeFileSync(queueFilePath(), JSON.stringify(payload, null, 2), 'utf8');
}

export function broadcastJobQueueChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('jobQueue:changed');
  }
}

function touch(mutator: () => void): void {
  ensureLoaded();
  mutator();
  persist();
  broadcastJobQueueChanged();
}

function matchesFilter(job: AutomationJobRecord, filter?: AutomationJobListFilter): boolean {
  if (!filter) return true;
  if (filter.brandName && job.brandName !== filter.brandName) return false;
  if (filter.platform && job.platform !== filter.platform) return false;
  return true;
}

function listRunningJobs(): AutomationJobRecord[] {
  return jobs.filter((job) => job.status === 'running');
}

export function getRunningJobCount(): number {
  ensureLoaded();
  return listRunningJobs().length;
}

export function getQueuedJobCount(): number {
  ensureLoaded();
  return jobs.filter((job) => job.status === 'queued').length;
}

export function getRunnerState(): AutomationJobRunnerState {
  ensureLoaded();
  if (runnerPaused) return 'paused';
  if (getRunningJobCount() > 0) return 'running';
  return 'idle';
}

function buildQueueStats() {
  const runningJobs = listRunningJobs();
  const slotStats = getExecuteSlotStats();
  const maxWa = getMaxConcurrentAutomationJobs('whatsapp');
  const maxTg = getMaxConcurrentAutomationJobs('telegram');
  return {
    runningJobIds: runningJobs.map((job) => job.id),
    runningJobId: runningJobs[0]?.id ?? null,
    maxConcurrent: maxWa + maxTg,
    runningCount: runningJobs.length,
    queuedCount: getQueuedJobCount(),
    blockingExecutes: isJobQueueBlockingExecutes(jobs),
    busyAccountIds: listBusyAccountIds(jobs),
    settlingSessionIds: listSettlingSessionIds(),
    globalScrapeActive:
      getActiveScrapeSessionCount() > 0 || getActiveAutoScrapeSessionCount() > 0,
    activeScrapeSessionIds: [
      ...listActiveScrapeSessionIds(),
      ...listActiveAutoScrapeSessionIds(),
    ],
    executeSlotsActive: slotStats.activeCount,
    executeSlotsMax: slotStats.maxConcurrent,
    executeSlotsQueued: slotStats.queuedCount,
  };
}

export function getJobQueueSnapshot(filter?: AutomationJobListFilter): AutomationJobQueueSnapshot {
  ensureLoaded();
  const filtered = filter ? jobs.filter((job) => matchesFilter(job, filter)) : [...jobs];
  filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    jobs: filtered,
    runnerState: getRunnerState(),
    ...buildQueueStats(),
  };
}

export function setRunnerPaused(paused: boolean): AutomationJobRunnerState {
  touch(() => {
    runnerPaused = paused;
  });
  return getRunnerState();
}

export function enqueueAutomationJob(input: AutomationJobEnqueueInput): AutomationJobRecord {
  ensureLoaded();

  if (!input.allowMultipleQueued) {
    const duplicateAccount = jobs.some(
      (job) =>
        job.accountId === input.accountId &&
        job.action === input.action &&
        (job.status === 'queued' || job.status === 'running'),
    );
    if (duplicateAccount) {
      throw new Error('JOB_ALREADY_QUEUED_FOR_ACCOUNT');
    }
  }

  const totalToCreate = Math.max(1, Math.floor(Number(input.payload.totalToCreate) || 1));
  const perRun = Math.max(
    1,
    Math.floor(Number(input.payload.perRun) || totalToCreate),
  );
  const stepTotal =
    input.action === 'create_group'
      ? totalToCreate
      : Math.max(1, input.payload.groups?.length ?? (input.payload.inviteLink || input.payload.groupId ? 1 : 1));

  const created: AutomationJobRecord = {
    id: randomUUID(),
    brandName: input.brandName,
    platform: input.platform,
    accountId: input.accountId,
    accountName: input.accountName,
    sessionId: input.sessionId,
    action: input.action,
    status: 'queued',
    createdAt: new Date().toISOString(),
    payload: {
      ...input.payload,
      totalToCreate: input.action === 'create_group' ? totalToCreate : input.payload.totalToCreate,
      perRun: input.action === 'create_group' ? perRun : input.payload.perRun,
    },
    storedSessionString: input.storedSessionString ?? null,
    expectedPhone: input.expectedPhone,
    delay: input.delay,
    progress: { current: 0, total: stepTotal, label: input.payload.groupNamePrefix ?? input.payload.groupName },
  };
  jobs.push(created);
  persist();
  broadcastJobQueueChanged();
  return created;
}

function bumpJobToQueueFront(job: AutomationJobRecord): void {
  const queuedTimes = jobs
    .filter((row) => row.status === 'queued' && row.id !== job.id)
    .map((row) => row.createdAt);
  const earliest = queuedTimes.length > 0 ? queuedTimes.sort()[0]! : job.createdAt;
  const nextTime = new Date(new Date(earliest).getTime() - 1);
  job.createdAt = Number.isNaN(nextTime.getTime()) ? new Date().toISOString() : nextTime.toISOString();
}

function requeueAutomationJob(job: AutomationJobRecord): void {
  job.status = 'queued';
  job.paused = false;
  delete job.startedAt;
  delete job.finishedAt;
  delete job.error;
  delete job.message;
  if (job.action === 'create_group' && (job.payload.totalToCreate ?? 1) > 1) {
    const total = job.payload.totalToCreate ?? 1;
    job.progress = {
      current: 0,
      total,
      label: job.progress?.label ?? job.payload.groupNamePrefix ?? job.payload.groupName,
    };
  }
  bumpJobToQueueFront(job);
}

export function runAutomationJob(jobId: string): boolean {
  let changed = false;
  touch(() => {
    const job = jobs.find((row) => row.id === jobId);
    if (!job) return;
    if (job.status === 'failed' || job.status === 'cancelled') {
      requeueAutomationJob(job);
      changed = true;
      return;
    }
    if (job.status !== 'queued') return;
    job.paused = false;
    bumpJobToQueueFront(job);
    changed = true;
  });
  return changed;
}

export function pauseAutomationJob(jobId: string): boolean {
  let changed = false;
  touch(() => {
    const job = jobs.find((row) => row.id === jobId);
    if (!job) return;
    if (job.status === 'queued' && !job.paused) {
      job.paused = true;
      changed = true;
      return;
    }
    if (job.status === 'running') {
      requestJobStop(jobId, 'pause');
      job.status = 'queued';
      job.paused = true;
      delete job.startedAt;
      markSessionSettleAfterJob(job.sessionId);
      changed = true;
    }
  });
  return changed;
}

export function cancelAutomationJob(jobId: string): boolean {
  let changed = false;
  touch(() => {
    const job = jobs.find((row) => row.id === jobId);
    if (!job) return;
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.paused = false;
      job.finishedAt = new Date().toISOString();
      changed = true;
      return;
    }
    if (job.status === 'running') {
      requestJobStop(jobId, 'cancel');
      job.status = 'cancelled';
      job.paused = false;
      job.finishedAt = new Date().toISOString();
      markSessionSettleAfterJob(job.sessionId);
      changed = true;
    }
  });
  return changed;
}

/** Hapus baris antrian; running di-force stop dulu. */
export function removeAutomationJobs(jobIds: string[]): number {
  if (jobIds.length === 0) return 0;
  const idSet = new Set(jobIds);
  let removed = 0;
  touch(() => {
    const before = jobs.length;
    jobs = jobs.filter((job) => {
      if (!idSet.has(job.id)) return true;
      if (job.status === 'running') {
        requestJobStop(job.id, 'cancel');
        markSessionSettleAfterJob(job.sessionId);
      }
      removed += 1;
      return false;
    });
    if (removed !== before - jobs.length) {
      removed = before - jobs.length;
    }
  });
  return removed;
}

/**
 * Slot execute kosong sekarang — hanya hitung active (bukan FIFO waiters).
 * Waiter FIFO sudah mengantri; jangan kurangi budget dispatch job/scrape lain.
 * Scrape Now + job berbeda akun berbagi kuota maxConcurrent per platform (default 10).
 */
export function countFreeExecuteSlots(platform: 'whatsapp' | 'telegram'): number {
  const stats = getExecuteSlotStats().byPlatform[platform];
  return Math.max(0, stats.maxConcurrent - stats.activeCount);
}

/** FIFO per platform — hingga maxConcurrent job berbeda akun; sisa slot diisi scrape/job campur. */
export function pickQueuedJobsForDispatch(): AutomationJobRecord[] {
  ensureLoaded();
  const picked: AutomationJobRecord[] = [];
  const platforms = ['whatsapp', 'telegram'] as const;

  for (const platform of platforms) {
    const maxConcurrent = getMaxConcurrentAutomationJobs(platform);
    const running = listRunningJobs().filter((job) => job.platform === platform);
    const freeSlots = countFreeExecuteSlots(platform);
    // Jangan lewat max job running ATAU slot execute (scrape manual juga pegang slot).
    const dispatchBudget = Math.min(maxConcurrent - running.length, freeSlots);
    if (dispatchBudget <= 0) continue;

    const runningAccountIds = new Set(running.map((job) => job.accountId));
    const queued = jobs
      .filter(
        (job) =>
          job.status === 'queued' && !job.paused && job.platform === platform,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    let platformPicked = 0;
    for (const job of queued) {
      if (platformPicked >= dispatchBudget) break;
      if (runningAccountIds.has(job.accountId)) continue;
      if (isScrapeActiveForSession(job.sessionId)) continue;
      if (isAutoScrapeActiveForSession(job.sessionId)) continue;
      if (picked.some((row) => row.accountId === job.accountId)) continue;
      picked.push(job);
      runningAccountIds.add(job.accountId);
      platformPicked += 1;
    }
  }

  return picked;
}

export function markJobRunning(jobId: string): boolean {
  let started = false;
  touch(() => {
    const job = jobs.find((row) => row.id === jobId);
    if (!job || job.status !== 'queued') return;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    const stepTotal = accountJobStepTotal(job);
    job.progress = job.progress ?? {
      current: 0,
      total: stepTotal,
      label: job.payload.groupNamePrefix ?? job.payload.groupName ?? job.accountName,
    };
    if (job.progress.total !== stepTotal) {
      job.progress.total = stepTotal;
    }
    started = true;
  });
  return started;
}

/** Jobs stuck in running (browser hang) — fail so queue can continue. */
export function failStaleRunningJobs(maxAgeMs: number): number {
  let failed = 0;
  const now = Date.now();
  touch(() => {
    for (const job of jobs) {
      if (job.status !== 'running' || !job.startedAt) continue;
      const age = now - new Date(job.startedAt).getTime();
      if (age <= maxAgeMs) continue;
      job.status = 'failed';
      job.finishedAt = new Date().toISOString();
      job.error = 'JOB_STALE_TIMEOUT';
      job.message = 'Job exceeded maximum runtime — cancelled automatically';
      markSessionSettleAfterJob(job.sessionId);
      failed += 1;
    }
  });
  return failed;
}

export function updateJobProgress(
  jobId: string,
  progress: AutomationJobRecord['progress'],
): void {
  if (!progress) return;
  touch(() => {
    const job = jobs.find((row) => row.id === jobId);
    if (!job || job.status !== 'running') return;
    job.progress = progress;
  });
}

export function markJobFinished(
  jobId: string,
  status: Extract<AutomationJobStatus, 'completed' | 'failed'>,
  detail?: {
    message?: string;
    error?: string;
    batchSuccess?: number;
    groupOutcomes?: AutomationJobRecord['payload']['groupOutcomes'];
  },
): void {
  touch(() => {
    const job = jobs.find((row) => row.id === jobId);
    if (!job || job.status !== 'running') return;
    job.status = status;
    job.finishedAt = new Date().toISOString();
    job.error = detail?.error;
    markSessionSettleAfterJob(job.sessionId);

    const batchTotal = Math.max(1, Math.floor(Number(job.payload.totalToCreate) || 1));
    const isCreateBatch = job.action === 'create_group' && batchTotal > 1;
    if (isCreateBatch) {
      const parsed = parseBatchSuccessFromMessage(detail?.message);
      const success = Math.max(
        0,
        detail?.batchSuccess ?? parsed ?? job.progress?.current ?? 0,
      );
      job.progress = {
        current: success,
        total: batchTotal,
        label: job.progress?.label ?? job.payload.groupNamePrefix ?? job.payload.groupName,
      };
      const rawMessage = detail?.message?.trim();
      job.message =
        rawMessage && rawMessage !== 'OK' ? rawMessage : `${success}/${batchTotal} created`;
      if (detail?.groupOutcomes?.length) {
        job.payload.groupOutcomes = detail.groupOutcomes;
      }
      return;
    }

    job.message = detail?.message;
    if (detail?.groupOutcomes?.length) {
      job.payload.groupOutcomes = detail.groupOutcomes;
    }
  });
}

function parseBatchSuccessFromMessage(message?: string): number | undefined {
  if (!message) return undefined;
  const match = message.match(/^(\d+)\/(\d+)\s+created/i);
  if (!match) return undefined;
  const success = Number(match[1]);
  return Number.isFinite(success) ? success : undefined;
}
