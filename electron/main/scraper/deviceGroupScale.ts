/** Target operasional: akun dengan ribuan grup (hingga ~3000). */
export const DEVICE_GROUP_TARGET_MAX = 3000;

/** Batas aman daftar grup dari store WA Web (satu pass di browser). */
export const WA_STORE_GROUP_LIST_CAP = 6000;

/** Scrape / admin detail — paralel terbatas agar Chrome tidak jebol. */
export const WA_GROUP_PROCESS_CONCURRENCY = 12;

const COUNT_BASE_MS = 120_000;
const COUNT_PER_GROUP_MS = 30;
const COUNT_MAX_MS = 1_200_000;

const SCRAPE_BASE_MS = 120_000;
const SCRAPE_PER_GROUP_MS = 2_500;
const SCRAPE_MAX_MS = 3_600_000;

/** Mirror `src/config/syncScraperPolicy.ts` — angka nyata Y/X, cap 3000, tanpa floor 500. */
function clampGroupEstimate(estimate: number): number {
  return Math.max(0, Math.min(estimate || 0, DEVICE_GROUP_TARGET_MAX));
}

function scaledMs(
  baseMs: number,
  perGroupMs: number,
  maxMs: number,
  estimate: number,
): number {
  const est = clampGroupEstimate(estimate);
  return Math.min(maxMs, baseMs + est * perGroupMs);
}

export function countGroupsTimeoutMs(estimate = 0): number {
  return scaledMs(COUNT_BASE_MS, COUNT_PER_GROUP_MS, COUNT_MAX_MS, estimate);
}

export function scrapeGroupsTimeoutMs(estimate = 0): number {
  return scaledMs(SCRAPE_BASE_MS, SCRAPE_PER_GROUP_MS, SCRAPE_MAX_MS, estimate);
}

export function waQrBootstrapDeadlineMs(estimate = 0): number {
  return scaledMs(45_000, 280, 900_000, estimate);
}

export function waQrScanWaitMs(estimate = 0): number {
  return scaledMs(120_000, 40, 1_200_000, estimate);
}

export function waDiskRestoreTimeoutMs(estimate = 0): number {
  return scaledMs(45_000, 120, 600_000, estimate);
}

export function waSessionLockWaitMs(estimate = 0): number {
  return scaledMs(45_000, 120, 600_000, estimate);
}

export class ScrapeTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${Math.round(ms / 1000)}s`);
    this.name = 'ScrapeTimeoutError';
  }
}

export function withScrapeTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'Scrape',
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ScrapeTimeoutError(label, ms)), ms);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Jalankan promise per item dengan pool konkuren (urutan hasil = urutan items). */
export async function runPooled<T, R>(
  items: readonly T[],
  poolSize: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const size = Math.max(1, Math.min(poolSize, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}
