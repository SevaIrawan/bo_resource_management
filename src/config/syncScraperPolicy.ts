/**
 * Kebijakan tunggal Sync/Scrape — mirror `electron/main/scraper/deviceGroupScale.ts`.
 * Timeout diskalakan dari angka grup **nyata** di grid (Y/X); cap 3000. Tanpa floor 500.
 */
export const SYNC_SCRAPER_POLICY = {
  deviceGroupTargetMax: 3000,

  login: {
    persistTimeoutMs: 180_000,
    postLoginGraceMs: 120_000,
  },

  manualSync: {
    baseMs: 120_000,
    perGroupMs: 20,
    maxMs: 1_200_000,
  },

  postLoginSync: {
    baseMs: 120_000,
    perGroupMs: 15,
    maxMs: 900_000,
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
  waLoginConfirming: {
    baseMs: 180_000,
    perGroupMs: 150,
    maxMs: 1_200_000,
  },

  deviceSessionProbe: {
    baseMs: 45_000,
    perGroupMs: 80,
    maxMs: 600_000,
  },
  deviceSessionWarm: {
    baseMs: 45_000,
    perGroupMs: 80,
    maxMs: 600_000,
  },
} as const;

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

export function manualSyncTimeoutMs(
  estimate: number = 0,
): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.manualSync, estimate);
}

export function postLoginSyncTimeoutMs(
  estimate: number = 0,
): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.postLoginSync, estimate);
}

/** Deadline QR pertama muncul (Chrome + web.whatsapp.com). */
export function waQrBootstrapDeadlineMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.waQrBootstrap, estimate);
}

/** Setelah QR tampil — tunggu scan (UI guard; main tidak bunuh Puppeteer). */
export function waQrScanWaitMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.waQrScan, estimate);
}

/** Setelah scan — tunggu event `ready` (akun besar). */
export function waLoginConfirmingTimeoutMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.waLoginConfirming, estimate);
}

export function deviceSessionProbeTimeoutMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.deviceSessionProbe, estimate);
}

export function deviceSessionWarmTimeoutMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.deviceSessionWarm, estimate);
}
