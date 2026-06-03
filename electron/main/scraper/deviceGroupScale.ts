/** Target operasional: akun dengan ribuan grup (mis. ~2000). */
export const DEVICE_GROUP_TARGET_MAX = 2000;

/** Batas aman daftar grup dari store WA Web (satu pass di browser). */
export const WA_STORE_GROUP_LIST_CAP = 5000;

/** Scrape / admin detail — paralel terbatas agar Chrome tidak jebol. */
export const WA_GROUP_PROCESS_CONCURRENCY = 12;

const COUNT_BASE_MS = 90_000;
const COUNT_PER_GROUP_MS = 40;
const COUNT_MAX_MS = 900_000;

const SCRAPE_BASE_MS = 120_000;
const SCRAPE_PER_GROUP_MS = 2_500;
const SCRAPE_MAX_MS = 3_600_000;

export function countGroupsTimeoutMs(estimate = DEVICE_GROUP_TARGET_MAX): number {
  return Math.min(COUNT_MAX_MS, COUNT_BASE_MS + estimate * COUNT_PER_GROUP_MS);
}

export function scrapeGroupsTimeoutMs(estimate = DEVICE_GROUP_TARGET_MAX): number {
  return Math.min(SCRAPE_MAX_MS, SCRAPE_BASE_MS + estimate * SCRAPE_PER_GROUP_MS);
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
