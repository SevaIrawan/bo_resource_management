import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import type {
  AutomationJobEnqueueInput,
  AutomationJobListFilter,
  AutomationJobQueueSnapshot,
} from '@/types/automationJob';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

function jobQueueApi() {
  return window.electronAPI?.jobQueue;
}

export async function fetchJobQueueSnapshot(
  filter?: AutomationJobListFilter,
): Promise<AutomationJobQueueSnapshot | null> {
  const api = jobQueueApi()?.getSnapshot;
  if (!api) return null;
  return api(filter);
}

/** True when queued/running jobs block Sync & Scraper on the Account tab. */
export async function isAutomationJobQueueBlockingExecutes(): Promise<boolean> {
  const snapshot = await fetchJobQueueSnapshot();
  return Boolean(snapshot?.blockingExecutes);
}

/** Job queue aktif atau scraper penuh sedang jalan — skip auto-sync cycle. */
export async function isHeavyDeviceExecuteBlocked(): Promise<boolean> {
  const snapshot = await fetchJobQueueSnapshot();
  if (!snapshot) return false;
  return Boolean(snapshot.blockingExecutes || snapshot.globalScrapeActive);
}

export type AccountExecuteBlockCode = 'JOB_QUEUE_EXECUTE_FULL' | 'SESSION_CHECK_BUSY';

/** Pre-check Sync/Run — selaras main `resolveAccountExecuteBlockReason`. */
export async function resolveAccountExecuteBlock(
  account: AccountBrandRow,
): Promise<AccountExecuteBlockCode | null> {
  const snapshot = await fetchJobQueueSnapshot();
  if (!snapshot) return null;
  if (snapshot.blockingExecutes) return 'JOB_QUEUE_EXECUTE_FULL';
  if (snapshot.globalScrapeActive) return 'SESSION_CHECK_BUSY';

  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: account.id,
    platform: account.platform,
    accountId: account.id,
  });
  if (snapshot.settlingSessionIds.includes(deviceSessionId)) {
    return 'SESSION_CHECK_BUSY';
  }
  return null;
}

export async function isAccountSessionSettling(account: AccountBrandRow): Promise<boolean> {
  const snapshot = await fetchJobQueueSnapshot();
  if (!snapshot?.settlingSessionIds.length) return false;
  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: account.id,
    platform: account.platform,
    accountId: account.id,
  });
  return snapshot.settlingSessionIds.includes(deviceSessionId);
}

export async function enqueueAutomationJob(
  input: AutomationJobEnqueueInput,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const api = jobQueueApi()?.enqueue;
  if (!api) return { ok: false, error: 'JOB_QUEUE_DESKTOP_REQUIRED' };
  const result = await api({
    ...input,
    payload: input.payload as Record<string, unknown>,
    delay: input.delay as Record<string, number | undefined> | undefined,
  });
  if (!result.ok) return { ok: false, error: result.error ?? 'ENQUEUE_FAILED' };
  return { ok: true, jobId: result.job.id };
}

export async function cancelAutomationJob(jobId: string): Promise<boolean> {
  const api = jobQueueApi()?.cancel;
  if (!api) return false;
  const result = await api(jobId);
  return Boolean(result.ok);
}

export async function runAutomationJob(jobId: string): Promise<boolean> {
  const api = jobQueueApi()?.run;
  if (!api) return false;
  const result = await api(jobId);
  return Boolean(result.ok);
}

export async function pauseAutomationJob(jobId: string): Promise<boolean> {
  const api = jobQueueApi()?.pauseJob;
  if (!api) return false;
  const result = await api(jobId);
  return Boolean(result.ok);
}

export async function removeAutomationJobs(jobIds: string[]): Promise<number> {
  const api = jobQueueApi()?.removeJobs;
  if (!api || jobIds.length === 0) return 0;
  const result = await api(jobIds);
  return result.removed ?? 0;
}

export async function clearCompletedAutomationJobs(
  filter?: AutomationJobListFilter,
): Promise<number> {
  const api = jobQueueApi()?.clearCompleted;
  if (!api) return 0;
  const result = await api(filter);
  return result.removed ?? 0;
}

export async function setJobQueuePaused(
  paused: boolean,
): Promise<AutomationJobQueueSnapshot['runnerState'] | null> {
  const api = jobQueueApi()?.setPaused;
  if (!api) return null;
  const result = await api(paused);
  return result.runnerState ?? null;
}

export function subscribeJobQueueChanged(callback: () => void): () => void {
  const api = jobQueueApi()?.onChanged;
  if (!api) return () => undefined;
  return api(callback);
}

export function isJobQueueAvailable(): boolean {
  return Boolean(jobQueueApi()?.getSnapshot);
}
