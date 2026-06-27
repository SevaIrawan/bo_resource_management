type Platform = 'whatsapp' | 'telegram';

export interface ScrapeCancelRegistry {
  CancelledError: new () => Error;
  registerActive: (sessionId: string) => void;
  clearActive: (sessionId: string) => void;
  isCancelled: (sessionId: string) => boolean;
  isActiveForSession: (sessionId: string) => boolean;
  getActiveCount: () => number;
  listActiveSessionIds: () => string[];
  throwIfCancelled: (sessionId: string) => void;
  abortActive: (sessionId: string, platform: Platform) => Promise<void>;
}

export function createScrapeCancelRegistry(cancelledErrorName: string): ScrapeCancelRegistry {
  class CancelledError extends Error {
    constructor() {
      super('SCRAPER_CANCELLED');
      this.name = cancelledErrorName;
    }
  }

  const activeSessionIds = new Set<string>();
  const cancelledBySession = new Map<string, boolean>();

  return {
    CancelledError,
    registerActive(sessionId: string) {
      activeSessionIds.add(sessionId);
      cancelledBySession.set(sessionId, false);
    },
    clearActive(sessionId: string) {
      activeSessionIds.delete(sessionId);
      cancelledBySession.delete(sessionId);
    },
    isCancelled(sessionId: string) {
      return activeSessionIds.has(sessionId) && cancelledBySession.get(sessionId) === true;
    },
    isActiveForSession(sessionId: string) {
      return activeSessionIds.has(sessionId);
    },
    getActiveCount() {
      return activeSessionIds.size;
    },
    listActiveSessionIds() {
      return [...activeSessionIds];
    },
    throwIfCancelled(sessionId: string) {
      if (activeSessionIds.has(sessionId) && cancelledBySession.get(sessionId) === true) {
        throw new CancelledError();
      }
    },
    async abortActive(sessionId: string, platform: Platform) {
      if (activeSessionIds.has(sessionId)) {
        cancelledBySession.set(sessionId, true);
      }
      if (platform === 'whatsapp') {
        const { forceReleaseWhatsAppForLogin } = await import('../platformLogin/whatsapp');
        await forceReleaseWhatsAppForLogin(sessionId, { urgent: true, fast: true }).catch(() => undefined);
      }
    },
  };
}
