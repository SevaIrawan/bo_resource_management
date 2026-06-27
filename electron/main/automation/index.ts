import { ipcMain } from 'electron';
import { registerBrandGroupPhotoIpc } from '../brandGroupPhoto';
import { runTelegramAutomation } from './tgAutomationClient';
import type { AutomationRunPayload, AutomationRunResult, AutomationProgressCallback } from './types';
import { runWhatsAppAutomation } from './waAutomation';
import type {
  AutomationJobEnqueueInput,
  AutomationJobListFilter,
} from './jobQueueTypes';
import {
  cancelAutomationJob,
  enqueueAutomationJob,
  getJobQueueSnapshot,
  pauseAutomationJob,
  removeAutomationJobs,
  runAutomationJob,
  setRunnerPaused,
} from './jobQueueStore';
import { scheduleRunnerTick } from './jobQueueRunner';
import {
  getExecuteSlotStats,
  releaseExecuteSlot,
  tryAcquireExecuteSlot,
  waitForExecuteSlot,
} from './executeSlotPool';

const accountLocks = new Map<string, Promise<unknown>>();

export function withAutomationAccountLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = accountLocks.get(sessionId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  accountLocks.set(sessionId, next);
  void next.finally(() => {
    if (accountLocks.get(sessionId) === next) {
      accountLocks.delete(sessionId);
    }
  });
  return next;
}

export async function runAutomationAction(
  payload: AutomationRunPayload,
  onProgress?: AutomationProgressCallback,
): Promise<AutomationRunResult> {
  return withAutomationAccountLock(payload.sessionId, async () => {
    if (payload.platform === 'telegram') {
      return runTelegramAutomation(payload, onProgress);
    }
    if (payload.platform === 'whatsapp') {
      return runWhatsAppAutomation(payload, onProgress);
    }
    return {
      status: 'error',
      action: payload.action,
      message: `Unsupported platform: ${payload.platform}`,
      errorCode: 'UNSUPPORTED_PLATFORM',
    };
  });
}

export function registerAutomationIpc(): void {
  registerBrandGroupPhotoIpc();

  ipcMain.handle('automation:run', async (_event, payload: AutomationRunPayload) => {
    return runAutomationAction(payload);
  });

  ipcMain.handle('jobQueue:getSnapshot', (_event, filter?: AutomationJobListFilter) => {
    return getJobQueueSnapshot(filter);
  });

  ipcMain.handle('jobQueue:enqueue', (_event, input: AutomationJobEnqueueInput) => {
    try {
      const job = enqueueAutomationJob(input);
      scheduleRunnerTick(0);
      return { ok: true as const, job };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ENQUEUE_FAILED';
      return { ok: false as const, error: message };
    }
  });

  ipcMain.handle('jobQueue:cancel', (_event, jobId: string) => {
    const ok = cancelAutomationJob(jobId);
    if (ok) scheduleRunnerTick(0);
    return { ok };
  });

  ipcMain.handle('jobQueue:run', (_event, jobId: string) => {
    const ok = runAutomationJob(jobId);
    if (ok) scheduleRunnerTick(0);
    return { ok };
  });

  ipcMain.handle('jobQueue:pauseJob', (_event, jobId: string) => {
    const ok = pauseAutomationJob(jobId);
    if (ok) scheduleRunnerTick(0);
    return { ok };
  });

  ipcMain.handle('jobQueue:removeJobs', (_event, jobIds: string[]) => {
    const removed = removeAutomationJobs(Array.isArray(jobIds) ? jobIds : []);
    if (removed > 0) scheduleRunnerTick(0);
    return { ok: true, removed };
  });

  ipcMain.handle(
    'executeSlots:tryAcquire',
    (_event, accountId: string, kind: 'sync' | 'scraper' | 'job') =>
      tryAcquireExecuteSlot(accountId, kind),
  );

  ipcMain.handle('executeSlots:release', (_event, accountId: string) => {
    releaseExecuteSlot(accountId);
    scheduleRunnerTick(0);
    return { ok: true };
  });

  ipcMain.handle(
    'executeSlots:acquireOrWait',
    async (_event, accountId: string, kind: 'sync' | 'scraper' | 'job') => {
      const immediate = tryAcquireExecuteSlot(accountId, kind);
      if (immediate.ok) return { ok: true as const, queued: false };
      if (immediate.reason === 'same_account') {
        return { ok: false as const, reason: 'same_account' as const };
      }
      await waitForExecuteSlot(accountId, kind);
      return { ok: true as const, queued: true };
    },
  );

  ipcMain.handle('executeSlots:getStats', () => getExecuteSlotStats());

  setRunnerPaused(false);
  scheduleRunnerTick(0);
}
