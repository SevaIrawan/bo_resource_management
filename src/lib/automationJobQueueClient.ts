import type {
  AutomationJobEnqueueInput,
  AutomationJobListFilter,
  AutomationJobQueueSnapshot,
} from '@/types/automationJob';

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
