/**
 * Kebijakan tunggal Sync/Scrape — mirror `src/lib/deviceGroupScale.ts` + Electron scraper scale.
 * Acuan produk: `logic_sync_scraper.txt` bagian 4.
 */
export const SYNC_SCRAPER_POLICY = {
  deviceGroupTargetMax: 3000,
  accountGroupEstimateFloor: 500,

  login: {
    persistTimeoutMs: 180_000,
    postLoginGraceMs: 120_000,
  },

  manualSync: {
    baseMs: 180_000,
    perGroupMs: 20,
    maxMs: 1_200_000,
  },

  postLoginSync: {
    baseMs: 180_000,
    perGroupMs: 15,
    maxMs: 900_000,
  },

  /** Login QR WA — mirror `electron/main/scraper/deviceGroupScale.ts`. */
  waQrBootstrap: {
    baseMs: 240_000,
    perGroupMs: 60,
    maxMs: 900_000,
  },
  waQrScan: {
    baseMs: 600_000,
    perGroupMs: 80,
    maxMs: 1_200_000,
  },
  waLoginConfirming: {
    baseMs: 600_000,
    perGroupMs: 80,
    maxMs: 1_200_000,
  },
} as const;

export function accountGroupEstimate(metrics: {
  groupsCurrent?: number | null;
  groupsTotal?: number | null;
}): number {
  return Math.max(
    SYNC_SCRAPER_POLICY.accountGroupEstimateFloor,
    metrics.groupsCurrent ?? 0,
    metrics.groupsTotal ?? 0,
  );
}

function clampEstimate(estimate: number): number {
  return Math.max(
    SYNC_SCRAPER_POLICY.accountGroupEstimateFloor,
    Math.min(estimate, SYNC_SCRAPER_POLICY.deviceGroupTargetMax),
  );
}

export function manualSyncTimeoutMs(
  estimate: number = SYNC_SCRAPER_POLICY.deviceGroupTargetMax,
): number {
  const p = SYNC_SCRAPER_POLICY.manualSync;
  const safe = clampEstimate(estimate);
  return Math.min(p.maxMs, p.baseMs + safe * p.perGroupMs);
}

export function postLoginSyncTimeoutMs(
  estimate: number = SYNC_SCRAPER_POLICY.deviceGroupTargetMax,
): number {
  const p = SYNC_SCRAPER_POLICY.postLoginSync;
  const safe = clampEstimate(estimate);
  return Math.min(p.maxMs, p.baseMs + safe * p.perGroupMs);
}

function scaledPolicyMs(
  policy: { baseMs: number; perGroupMs: number; maxMs: number },
  estimate: number,
): number {
  const safe = clampEstimate(estimate);
  return Math.min(policy.maxMs, policy.baseMs + safe * policy.perGroupMs);
}

/** Deadline QR pertama muncul (Chrome + web.whatsapp.com). */
export function waQrBootstrapDeadlineMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.waQrBootstrap, estimate || SYNC_SCRAPER_POLICY.accountGroupEstimateFloor);
}

/** Setelah QR tampil — tunggu scan (UI guard; main tidak bunuh Puppeteer). */
export function waQrScanWaitMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.waQrScan, estimate || SYNC_SCRAPER_POLICY.accountGroupEstimateFloor);
}

/** Setelah scan — tunggu event `ready` (akun besar). */
export function waLoginConfirmingTimeoutMs(estimate = 0): number {
  return scaledPolicyMs(
    SYNC_SCRAPER_POLICY.waLoginConfirming,
    estimate || SYNC_SCRAPER_POLICY.accountGroupEstimateFloor,
  );
}
