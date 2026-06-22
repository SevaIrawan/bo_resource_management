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

/** Job queue: cek apakah sesi sedang dipakai scraper (global mono v1.0.19). */
export function isScrapeActiveForSession(sessionId: string): boolean {
  return activeSessionId === sessionId;
}

/** Scraper penuh sedang jalan di PC — job queue tunggu (hindari bentrok pool Chrome). */
export function isGlobalScrapeInFlight(): boolean {
  return activeSessionId !== null;
}

export function throwIfScrapeCancelled(sessionId: string): void {
  if (isScrapeCancelled(sessionId)) {
    throw new ScrapeCancelledError();
  }
}

/** Cancel scrape = stop total: flag + lepas Chrome WA (sama cancel-count). */
export async function abortActiveScrape(
  sessionId: string,
  platform: 'whatsapp' | 'telegram',
): Promise<void> {
  if (activeSessionId === sessionId) {
    cancelled = true;
  }
  if (platform === 'whatsapp') {
    const { forceReleaseWhatsAppForLogin } = await import('../platformLogin/whatsapp');
    await forceReleaseWhatsAppForLogin(sessionId, { urgent: true, fast: true }).catch(() => undefined);
  }
}
