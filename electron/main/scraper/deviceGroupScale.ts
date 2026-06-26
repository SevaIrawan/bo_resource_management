/** Batas operasional scrape per akun — selaras cap store WA Web (satu pass evaluate). */
export const WA_STORE_GROUP_LIST_CAP = 6000;

/** Alias legacy — sama dengan WA_STORE_GROUP_LIST_CAP. */
export const DEVICE_GROUP_TARGET_MAX = WA_STORE_GROUP_LIST_CAP;

/** Cek session valid/invalid — cold WA Chrome + TG restore; tidak baca daftar grup; tidak skala Y/X. */
export const SESSION_CHECK_TIMEOUT_MS = 20_000;

/** Post-login detect total grup — satu pass store; tidak skala jumlah grup. */
export const POST_LOGIN_DETECT_TIMEOUT_MS = 90_000;

/** Setelah QR ready — store biasanya sudah siap; tunggu pendek saja. */
export const QUICK_COUNT_STORE_WAIT_MS = 20_000;

/** Scrape metadata — evaluate berat; jangan 12 paralel di satu Puppeteer page. */
export const WA_SCRAPE_METADATA_CONCURRENCY = Math.max(
  1,
  Math.min(
    12,
    Math.floor(Number(process.env.RM_WA_SCRAPE_METADATA_CONCURRENCY) || 4),
  ),
);

/** Scrape / admin detail — paralel terbatas (count full admin scan). */
export const WA_GROUP_PROCESS_CONCURRENCY = 12;

/** Jeda antar grup saat scrape penuh (RM_WA_SCRAPE_GROUP_DELAY_MS / JITTER). */
export const WA_SCRAPE_GROUP_DELAY_MS = Math.max(
  0,
  Math.floor(Number(process.env.RM_WA_SCRAPE_GROUP_DELAY_MS) || 600),
);
export const WA_SCRAPE_GROUP_JITTER_MS = Math.max(
  0,
  Math.floor(Number(process.env.RM_WA_SCRAPE_GROUP_JITTER_MS) || 400),
);

/** Jeda antar export invite link (serial — selaras learning scraper). */
export function waInviteExportDelayMs(): number {
  if (WA_SCRAPE_GROUP_JITTER_MS <= 0) return WA_SCRAPE_GROUP_DELAY_MS;
  return WA_SCRAPE_GROUP_DELAY_MS + Math.floor(Math.random() * WA_SCRAPE_GROUP_JITTER_MS);
}

const COUNT_BASE_MS = 120_000;
const COUNT_PER_GROUP_MS = 30;
const COUNT_MAX_MS = 1_200_000;

const SCRAPE_BASE_MS = Math.max(
  60_000,
  Math.floor(Number(process.env.RM_SCRAPE_BASE_MS) || 120_000),
);
const SCRAPE_PER_GROUP_MS = Math.max(
  500,
  Math.floor(Number(process.env.RM_SCRAPE_PER_GROUP_MS) || 3_500),
);

/** Selaras INVITE_CODE_TIMEOUT_MS di whatsappGroupInviteLink.ts */
const WA_INVITE_FETCH_TIMEOUT_MS = 15_000;

/** Gagal jika tidak ada progress scrape selama interval ini (ms). Override: RM_SCRAPE_IDLE_MS */
export const SCRAPE_IDLE_TIMEOUT_MS = Math.max(
  120_000,
  Math.floor(Number(process.env.RM_SCRAPE_IDLE_MS) || 600_000),
);

export function clampGroupCount(count: number): number {
  return Math.max(0, Math.min(Math.floor(count) || 0, WA_STORE_GROUP_LIST_CAP));
}

/** @deprecated gunakan clampGroupCount */
function clampGroupEstimate(estimate: number): number {
  return clampGroupCount(estimate);
}

function scaledMs(
  baseMs: number,
  perGroupMs: number,
  maxMs: number,
  groupCount: number,
): number {
  const n = clampGroupCount(groupCount);
  return Math.min(maxMs, baseMs + n * perGroupMs);
}

/**
 * Estimasi fase metadata — log/observability; bukan pemutus scrape aktif.
 * groupCount = jumlah grup nyata di device (setelah list/count).
 */
export function scrapeGroupsBudgetMs(groupCount: number): number {
  const n = clampGroupCount(groupCount);
  return SCRAPE_BASE_MS + n * SCRAPE_PER_GROUP_MS;
}

/**
 * Estimasi fase invite serial (admin only) — dari konstanta delay + timeout fetch di kode WA.
 * Selaras rm-scrape-daily-master: getInviteCode serial, waInviteExportDelayMs antar admin.
 */
export function scrapeInvitePhaseBudgetMs(adminCount: number): number {
  const n = Math.max(0, Math.floor(adminCount) || 0);
  const perAdminMs =
    WA_INVITE_FETCH_TIMEOUT_MS + WA_SCRAPE_GROUP_DELAY_MS + WA_SCRAPE_GROUP_JITTER_MS;
  return n * perAdminMs;
}

/** Estimasi total dua fase — hanya log, watchdog idle yang memutus jika macet. */
export function scrapeTotalPlanMs(groupCount: number, adminCount: number): number {
  return scrapeGroupsBudgetMs(groupCount) + scrapeInvitePhaseBudgetMs(adminCount);
}

export function countGroupsTimeoutMs(estimate = 0, quick = false): number {
  if (quick) return POST_LOGIN_DETECT_TIMEOUT_MS;
  return scaledMs(COUNT_BASE_MS, COUNT_PER_GROUP_MS, COUNT_MAX_MS, estimate);
}

/** Alias kompat — estimate = jumlah grup nyata. */
export function scrapeGroupsTimeoutMs(groupCount = 0): number {
  return scrapeGroupsBudgetMs(groupCount);
}

/** Tunggu inbox WA stabil — skala dari hitungan grup di store. */
export function waInboxStableTimeoutMs(groupCount: number): number {
  return scaledMs(120_000, 80, 900_000, groupCount);
}

export function waQrBootstrapDeadlineMs(estimate = 0): number {
  return scaledMs(45_000, 280, 900_000, estimate);
}

export function waQrScanWaitMs(estimate = 0): number {
  return scaledMs(120_000, 40, 1_200_000, estimate);
}

export function waLoginConfirmingTimeoutMs(_estimate = 0): number {
  return 180_000;
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

/** @deprecated Pakai withScrapeWatchdog — tetap untuk count operasi pendek. */
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
