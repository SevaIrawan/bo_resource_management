import { createScrapeCancelRegistry } from './scrapeCancelRegistry';

const registry = createScrapeCancelRegistry('ScrapeCancelledError');

export const ScrapeCancelledError = registry.CancelledError;

export const registerActiveScrape = registry.registerActive;
export const clearActiveScrape = registry.clearActive;
export const isScrapeCancelled = registry.isCancelled;
export const isScrapeActiveForSession = registry.isActiveForSession;
export const getActiveScrapeSessionCount = registry.getActiveCount;
export const listActiveScrapeSessionIds = registry.listActiveSessionIds;
export const throwIfScrapeCancelled = registry.throwIfCancelled;
export const abortActiveScrape = registry.abortActive;
