import { isScrapeActiveForSession } from '../scraper/scrapeCancel';
import { isAccountJobQueueBusy } from './jobQueueBatchHelpers';
import { isSessionSettling } from './jobQueueSettle';
import type { AutomationJobRecord } from './jobQueueTypes';

export const JOB_QUEUE_EXECUTE_FULL_MESSAGE = 'JOB_QUEUE_EXECUTE_FULL';
export const SESSION_SETTLING_MESSAGE = 'SESSION_SETTLING';

export type AccountExecuteBlockReason =
  | typeof JOB_QUEUE_EXECUTE_FULL_MESSAGE
  | typeof SESSION_SETTLING_MESSAGE;

/** Blok hanya isolasi per akun — slot execute dipegang renderer/runner, bukan di guard IPC. */
export function resolveAccountExecuteBlockReason(
  sessionId: string,
  accountId: string,
  jobs: AutomationJobRecord[],
): AccountExecuteBlockReason | null {
  if (isAccountJobQueueBusy(jobs, accountId)) {
    return JOB_QUEUE_EXECUTE_FULL_MESSAGE;
  }
  if (isScrapeActiveForSession(sessionId)) {
    return JOB_QUEUE_EXECUTE_FULL_MESSAGE;
  }
  if (isSessionSettling(sessionId)) {
    return SESSION_SETTLING_MESSAGE;
  }
  return null;
}

export function assertAccountExecuteAllowed(
  sessionId: string,
  accountId: string,
  jobs: AutomationJobRecord[],
): void {
  const reason = resolveAccountExecuteBlockReason(sessionId, accountId, jobs);
  if (reason) {
    throw new Error(reason);
  }
}

export function accountExecuteBusyProbeResult(
  sessionId: string,
  accountId: string,
  jobs: AutomationJobRecord[],
): { valid: false; message: string } | null {
  const reason = resolveAccountExecuteBlockReason(sessionId, accountId, jobs);
  if (!reason) return null;
  return { valid: false, message: reason };
}
