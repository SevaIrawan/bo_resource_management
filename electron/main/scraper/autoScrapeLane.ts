import { isAccountJobQueueBusy } from '../automation/jobQueueBatchHelpers';
import {
  isExecuteSlotActiveForAccount,
} from '../automation/executeSlotPool';
import { getJobQueueSnapshot } from '../automation/jobQueueStore';
import { isSessionSettling } from '../automation/jobQueueSettle';
import { isScrapeActiveForSession } from './scrapeCancel';

let autoScrapeLaneSessionId: string | null = null;

export function tryAcquireAutoScrapeLane(sessionId: string): boolean {
  if (autoScrapeLaneSessionId && autoScrapeLaneSessionId !== sessionId) {
    return false;
  }
  autoScrapeLaneSessionId = sessionId;
  return true;
}

export function releaseAutoScrapeLane(sessionId: string): void {
  if (autoScrapeLaneSessionId === sessionId) {
    autoScrapeLaneSessionId = null;
  }
}

/** User lane sibuk untuk akun ini — auto scrape skip, jangan antre slot user. */
export function resolveUserLaneBlockForAutoScrape(
  sessionId: string,
  accountId: string,
): string | null {
  if (isExecuteSlotActiveForAccount(accountId)) {
    return 'EXECUTE_SLOT_BUSY';
  }
  if (isScrapeActiveForSession(sessionId)) {
    return 'USER_SCRAPE_BUSY';
  }
  const jobs = getJobQueueSnapshot().jobs;
  if (isAccountJobQueueBusy(jobs, accountId)) {
    return 'JOB_QUEUE_BUSY';
  }
  if (isSessionSettling(sessionId)) {
    return 'SESSION_SETTLING';
  }
  return null;
}
