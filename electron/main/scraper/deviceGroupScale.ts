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

export function countGroupsTimeoutMs(estimate = DEVICE_GROUP_TARGET_MAX): number {
  return Math.min(COUNT_MAX_MS, COUNT_BASE_MS + estimate * COUNT_PER_GROUP_MS);
}

export function scrapeGroupsTimeoutMs(estimate = DEVICE_GROUP_TARGET_MAX): number {
  return Math.min(SCRAPE_MAX_MS, SCRAPE_BASE_MS + estimate * SCRAPE_PER_GROUP_MS);
}

/** Deadline QR pertama muncul (Chrome + web.whatsapp.com) — akun besar butuh lebih lama. */
export function waQrBootstrapDeadlineMs(estimate = 0): number {
  const est = Math.max(500, Math.min(estimate || 500, DEVICE_GROUP_TARGET_MAX));
  return Math.min(900_000, 240_000 + est * 60);
}

/** Setelah QR tampil: tunggu scan (jangan bunuh Puppeteer terlalu cepat). */
export function waQrScanWaitMs(estimate = 0): number {
  const est = Math.max(500, Math.min(estimate || 500, DEVICE_GROUP_TARGET_MAX));
  return Math.min(1_200_000, 600_000 + est * 80);
}

/** Restore LocalAuth sebelum QR — akun ~3000 grup bisa butuh beberapa menit. */
export function waDiskRestoreTimeoutMs(estimate = 0): number {
  const est = Math.max(500, Math.min(estimate || 500, DEVICE_GROUP_TARGET_MAX));
  return Math.min(600_000, 45_000 + est * 120);
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
