import { isGlobalScrapeInFlight } from '../scraper/scrapeCancel';
import { isJobQueueBlockingOtherExecutes } from './jobQueueStore';
import { isSessionSettling } from './jobQueueSettle';

export const JOB_QUEUE_EXECUTE_FULL_MESSAGE = 'JOB_QUEUE_EXECUTE_FULL';
export const SESSION_SETTLING_MESSAGE = 'SESSION_SETTLING';
export const SCRAPER_GLOBAL_BUSY_MESSAGE = 'SCRAPER_GLOBAL_BUSY';

export type AccountExecuteBlockReason =
  | typeof JOB_QUEUE_EXECUTE_FULL_MESSAGE
  | typeof SESSION_SETTLING_MESSAGE
  | typeof SCRAPER_GLOBAL_BUSY_MESSAGE;

export function resolveAccountExecuteBlockReason(sessionId: string): AccountExecuteBlockReason | null {
  if (isJobQueueBlockingOtherExecutes()) {
    return JOB_QUEUE_EXECUTE_FULL_MESSAGE;
  }
  if (isGlobalScrapeInFlight()) {
    return SCRAPER_GLOBAL_BUSY_MESSAGE;
  }
  if (isSessionSettling(sessionId)) {
    return SESSION_SETTLING_MESSAGE;
  }
  return null;
}

/** Main-process guard — selaras renderer `getAccountExecuteBlockReason`. */
export function assertAccountExecuteAllowed(sessionId: string): void {
  const reason = resolveAccountExecuteBlockReason(sessionId);
  if (reason) {
    throw new Error(reason);
  }
}

/** @deprecated use assertAccountExecuteAllowed(sessionId) */
export function assertJobQueueNotBlockingExecutes(): void {
  if (isJobQueueBlockingOtherExecutes()) {
    throw new Error(JOB_QUEUE_EXECUTE_FULL_MESSAGE);
  }
}

export function accountExecuteBusyProbeResult(
  sessionId: string,
): { valid: false; message: string } | null {
  const reason = resolveAccountExecuteBlockReason(sessionId);
  if (!reason) return null;
  return { valid: false, message: reason };
}

export function jobQueueBusyProbeResult(): { valid: false; message: string } {
  return { valid: false, message: JOB_QUEUE_EXECUTE_FULL_MESSAGE };
}
