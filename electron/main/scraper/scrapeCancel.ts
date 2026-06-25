export class ScrapeCancelledError extends Error {
  constructor() {
    super('SCRAPER_CANCELLED');
    this.name = 'ScrapeCancelledError';
  }
}

const activeSessionIds = new Set<string>();
const cancelledBySession = new Map<string, boolean>();

export function registerActiveScrape(sessionId: string): void {
  activeSessionIds.add(sessionId);
  cancelledBySession.set(sessionId, false);
}

export function clearActiveScrape(sessionId: string): void {
  activeSessionIds.delete(sessionId);
  cancelledBySession.delete(sessionId);
}

export function requestScrapeCancel(sessionId: string): boolean {
  if (!activeSessionIds.has(sessionId)) return false;
  cancelledBySession.set(sessionId, true);
  return true;
}

export function isScrapeCancelled(sessionId: string): boolean {
  return activeSessionIds.has(sessionId) && cancelledBySession.get(sessionId) === true;
}

/** Job queue / guard per akun — scrape aktif hanya untuk sesi ini. */
export function isScrapeActiveForSession(sessionId: string): boolean {
  return activeSessionIds.has(sessionId);
}

/** @deprecated Kontrak multi-akun: jangan blok semua akun. Pakai areExecuteSlotsFull / per-session. */
export function isGlobalScrapeInFlight(): boolean {
  return activeSessionIds.size > 0;
}

export function getActiveScrapeSessionCount(): number {
  return activeSessionIds.size;
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
  if (activeSessionIds.has(sessionId)) {
    cancelledBySession.set(sessionId, true);
  }
  if (platform === 'whatsapp') {
    const { forceReleaseWhatsAppForLogin } = await import('../platformLogin/whatsapp');
    await forceReleaseWhatsAppForLogin(sessionId, { urgent: true, fast: true }).catch(() => undefined);
  }
}
