/**
 * Kebijakan tunggal Sync/Scrape — mirror `electron/main/scraper/deviceGroupScale.ts`.
 * Timeout scrape diskalaskan dari jumlah grup nyata di device; cap store 6000.
 * Sync Active = session light (tanpa detect/count timeout legacy).
 */
export const SYNC_SCRAPER_POLICY = {
  deviceGroupTargetMax: 6000,

  /** Idle watchdog floor (ms) — selaras SCRAPE_IDLE_TIMEOUT_MS; skala via scrapeIdleTimeoutMs. */
  scrapeIdleTimeoutMs: 900_000,
  scrapeIdleTimeoutMaxMs: 2_700_000,

  login: {
    persistTimeoutMs: 180_000,
    postLoginGraceMs: 120_000,
  },

  /** Login QR WA — grup sedikit = deadline pendek; ~3000 grup → mendekati max. */
  waQrBootstrap: {
    baseMs: 45_000,
    perGroupMs: 280,
    maxMs: 900_000,
  },
  waQrScan: {
    baseMs: 120_000,
    perGroupMs: 40,
    maxMs: 1_200_000,
  },
  /** Setelah scan QR — tunggu event ready; tidak skala jumlah grup. */
  waLoginConfirming: {
    timeoutMs: 180_000,
  },

  /** Sync/Scrape Check Session ke device — selaras electron SESSION_CHECK_TIMEOUT_MS. */
  sessionCheck: {
    timeoutMs: 90_000,
  },
} as const;

export function sessionCheckTimeoutMs(): number {
  return SYNC_SCRAPER_POLICY.sessionCheck.timeoutMs;
}

/** Estimasi operasi dari metrik grid — tanpa floor buatan; 0 jika belum ada data. */
export function accountGroupEstimate(metrics: {
  groupsCurrent?: number | null;
  groupsTotal?: number | null;
}): number {
  const y = metrics.groupsCurrent ?? 0;
  const x = metrics.groupsTotal ?? 0;
  return clampGroupEstimate(Math.max(y, x));
}

export function clampGroupEstimate(estimate: number): number {
  return Math.max(0, Math.min(estimate, SYNC_SCRAPER_POLICY.deviceGroupTargetMax));
}

function scaledPolicyMs(
  policy: { baseMs: number; perGroupMs: number; maxMs: number },
  estimate: number,
): number {
  const safe = clampGroupEstimate(estimate);
  return Math.min(policy.maxMs, policy.baseMs + safe * policy.perGroupMs);
}

/** Deadline QR pertama muncul (Chrome + web.whatsapp.com). */
export function waQrBootstrapDeadlineMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.waQrBootstrap, estimate);
}

/** Setelah QR tampil — tunggu scan (UI guard; main tidak bunuh Puppeteer). */
export function waQrScanWaitMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.waQrScan, estimate);
}

/** Setelah scan — tunggu event `ready`; tetap, bukan detect/scrape per grup. */
export function waLoginConfirmingTimeoutMs(_estimate = 0): number {
  return SYNC_SCRAPER_POLICY.waLoginConfirming.timeoutMs;
}
