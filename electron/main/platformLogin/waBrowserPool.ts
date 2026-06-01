/**
 * Batasi jumlah instance Chrome/Puppeteer WA yang hidup bersamaan.
 * 100+ akun = profil terpisah per sessionId, tapi tidak boleh 100 Chrome sekaligus.
 */
const DEFAULT_MAX_CONCURRENT_WA_BROWSERS = 4;

function readMaxSlots(): number {
  const raw = process.env.RM_WA_MAX_CONCURRENT_BROWSERS;
  if (!raw) return DEFAULT_MAX_CONCURRENT_WA_BROWSERS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_CONCURRENT_WA_BROWSERS;
  return Math.min(n, 12);
}

let slotsInUse = 0;
const waitQueue: Array<() => void> = [];

function releaseSlot(): void {
  slotsInUse = Math.max(0, slotsInUse - 1);
  const next = waitQueue.shift();
  if (next) next();
}

/** Satu slot global per operasi `client.initialize()` (login / scrape / probe). */
export async function withWaBrowserSlot<T>(fn: () => Promise<T>): Promise<T> {
  const maxSlots = readMaxSlots();
  if (slotsInUse >= maxSlots) {
    await new Promise<void>((resolve) => {
      waitQueue.push(resolve);
    });
  }
  slotsInUse += 1;
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

export function getWaBrowserPoolStats(): { inUse: number; waiting: number; max: number } {
  return {
    inUse: slotsInUse,
    waiting: waitQueue.length,
    max: readMaxSlots(),
  };
}
