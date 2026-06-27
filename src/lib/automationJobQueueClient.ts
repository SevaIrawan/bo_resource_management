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

function isAccountJobActive(
  jobs: AutomationJobQueueSnapshot['jobs'],
  accountId: string,
): boolean {
  return jobs.some(
    (job) =>
      job.accountId === accountId &&
      (job.status === 'running' || (job.status === 'queued' && !job.paused)),
  );
}

/** Job queue aktif pada akun yang sama — skip auto-scrape cycle untuk akun itu saja. */
export async function isHeavyDeviceExecuteBlockedForAccount(
  accountId: string,
): Promise<boolean> {
  const snapshot = await fetchJobQueueSnapshot();
  if (!snapshot) return false;
  return isAccountJobActive(snapshot.jobs, accountId);
}

/** Selaras `jobQueueGuard.ts` / `SESSION_SETTLING_MESSAGE`. */
export const SESSION_SETTLING_CODE = 'SESSION_SETTLING';

export type AccountExecuteBlockCode = 'JOB_QUEUE_EXECUTE_FULL' | typeof SESSION_SETTLING_CODE;

/** Pre-check Sync/Run — blok hanya akun yang sama (kontrak cross-account bebas). */
export async function resolveAccountExecuteBlock(
  account: AccountBrandRow,
): Promise<AccountExecuteBlockCode | null> {
  const snapshot = await fetchJobQueueSnapshot();
  if (!snapshot) return null;

  if (isAccountJobActive(snapshot.jobs, account.id)) {
    return 'JOB_QUEUE_EXECUTE_FULL';
  }

  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: account.id,
    platform: account.platform,
    accountId: account.id,
  });

  if (snapshot.activeScrapeSessionIds?.includes(deviceSessionId)) {
    return 'JOB_QUEUE_EXECUTE_FULL';
  }

  if (snapshot.settlingSessionIds.includes(deviceSessionId)) {
    return SESSION_SETTLING_CODE;
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

export function subscribeJobQueueChanged(callback: () => void): () => void {
  const api = jobQueueApi()?.onChanged;
  if (!api) return () => undefined;
  return api(callback);
}

export function isJobQueueAvailable(): boolean {
  return Boolean(jobQueueApi()?.getSnapshot);
}
