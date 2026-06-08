export class ScrapeCancelledError extends Error {
  constructor() {
    super('SCRAPER_CANCELLED');
    this.name = 'ScrapeCancelledError';
  }
}

let activeSessionId: string | null = null;
let cancelled = false;

export function registerActiveScrape(sessionId: string): void {
  activeSessionId = sessionId;
  cancelled = false;
}

export function clearActiveScrape(sessionId: string): void {
  if (activeSessionId === sessionId) {
    activeSessionId = null;
    cancelled = false;
  }
}

export function requestScrapeCancel(sessionId: string): boolean {
  if (activeSessionId !== sessionId) return false;
  cancelled = true;
  return true;
}

export function isScrapeCancelled(sessionId: string): boolean {
  return activeSessionId === sessionId && cancelled;
}

export function throwIfScrapeCancelled(sessionId: string): void {
  if (isScrapeCancelled(sessionId)) {
    throw new ScrapeCancelledError();
  }
}
