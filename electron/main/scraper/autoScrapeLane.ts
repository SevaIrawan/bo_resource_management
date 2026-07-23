import { isAccountJobQueueBusy } from '../automation/jobQueueBatchHelpers';
import { isExecuteSlotActiveForAccount } from '../automation/executeSlotPool';
import { getJobQueueSnapshot } from '../automation/jobQueueStore';
import { isSessionSettling } from '../automation/jobQueueSettle';
import { isScrapeActiveForSession } from './scrapeCancel';
import {
  DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
  HARD_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
} from '../../../src/config/deviceConcurrencyPolicy';

type AutoScrapePlatform = 'whatsapp' | 'telegram';

const maxSessionsPerPlatform = Math.min(
  DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
  HARD_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
);

/** sessionId → platform (hingga max brand slots per platform). */
const activeSessions = new Map<string, AutoScrapePlatform>();

function activeCount(platform: AutoScrapePlatform): number {
  let n = 0;
  for (const p of activeSessions.values()) {
    if (p === platform) n += 1;
  }
  return n;
}

export function tryAcquireAutoScrapeLane(
  sessionId: string,
  platform: AutoScrapePlatform = 'whatsapp',
): boolean {
  if (activeSessions.has(sessionId)) return true;
  if (activeCount(platform) >= maxSessionsPerPlatform) return false;
  activeSessions.set(sessionId, platform);
  return true;
}

export function releaseAutoScrapeLane(sessionId: string): void {
  activeSessions.delete(sessionId);
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
