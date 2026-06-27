import { createScrapeCancelRegistry } from './scrapeCancelRegistry';

const registry = createScrapeCancelRegistry('AutoScrapeCancelledError');

export const AutoScrapeCancelledError = registry.CancelledError;

export const registerActiveAutoScrape = registry.registerActive;
export const clearActiveAutoScrape = registry.clearActive;
export const isAutoScrapeCancelled = registry.isCancelled;
export const isAutoScrapeActiveForSession = registry.isActiveForSession;
export const getActiveAutoScrapeSessionCount = registry.getActiveCount;
export const listActiveAutoScrapeSessionIds = registry.listActiveSessionIds;
export const throwIfAutoScrapeCancelled = registry.throwIfCancelled;
export const abortActiveAutoScrape = registry.abortActive;
