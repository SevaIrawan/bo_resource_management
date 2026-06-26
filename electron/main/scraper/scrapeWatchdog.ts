import { ScrapeTimeoutError } from './deviceGroupScale';

type WatchdogHandle = {
  touch: () => void;
  dispose: () => void;
};

const watchdogs = new Map<string, WatchdogHandle>();

/** Reset idle timer — dipanggil tiap progress / tiap grup selesai. */
export function touchScrapeWatchdog(sessionId: string): void {
  watchdogs.get(sessionId)?.touch();
}

export function disposeScrapeWatchdog(sessionId: string): void {
  watchdogs.get(sessionId)?.dispose();
  watchdogs.delete(sessionId);
}

/**
 * Gagal hanya jika tidak ada progress (idle) — bukan wall-clock tetap.
 * onStale wajib membatalkan scrape + lepas resource (kontrak multi-akun).
 */
export function withScrapeWatchdog<T>(
  sessionId: string,
  fn: () => Promise<T>,
  input: {
    label: string;
    idleMs: number;
    onStale: (sessionId: string) => void | Promise<void>;
  },
): Promise<T> {
  disposeScrapeWatchdog(sessionId);

  return new Promise<T>((resolve, reject) => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const clearIdle = (): void => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const finish = (handler: () => void): void => {
      if (settled) return;
      settled = true;
      clearIdle();
      watchdogs.delete(sessionId);
      handler();
    };

    const touch = (): void => {
      if (settled) return;
      clearIdle();
      idleTimer = setTimeout(() => {
        void (async () => {
          try {
            await input.onStale(sessionId);
          } catch {
            // abort best-effort
          }
          finish(() => {
            reject(
              new ScrapeTimeoutError(
                `SCRAPER_IDLE_STUCK: ${input.label}: no progress for ${Math.round(input.idleMs / 1000)}s`,
                input.idleMs,
              ),
            );
          });
        })();
      }, input.idleMs);
    };

    const dispose = (): void => {
      if (settled) return;
      settled = true;
      clearIdle();
      watchdogs.delete(sessionId);
    };

    watchdogs.set(sessionId, { touch, dispose });
    touch();

    void fn().then(
      (result) => {
        finish(() => resolve(result));
      },
      (error) => {
        finish(() => reject(error));
      },
    );
  });
}
