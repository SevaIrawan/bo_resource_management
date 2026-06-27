/**
 * Kebijakan tunggal Sync/Scrape — mirror `electron/main/scraper/deviceGroupScale.ts`.
 * Timeout scrape diskalakan dari jumlah grup nyata di device; cap store 6000.
 */
export const SYNC_SCRAPER_POLICY = {
  deviceGroupTargetMax: 6000,

  login: {
    persistTimeoutMs: 180_000,
    postLoginGraceMs: 120_000,
  },

  /** Detect total grup (post-login / legacy paths) — bukan auto scrape Settings. */
  syncDetect: {
    timeoutMs: 90_000,
  },

  /** @deprecated Scrape/admin — bukan detect; scrape pakai scrapeGroupsTimeoutMs di main. */
  manualSync: {
    baseMs: 120_000,
    perGroupMs: 20,
    maxMs: 1_200_000,
  },

  /** Alias syncDetect — backward compat nama. */
  postLoginDetect: {
    timeoutMs: 90_000,
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
  /** Setelah scan QR — tunggu event ready; tidak skala jumlah grup. */
  waLoginConfirming: {
    timeoutMs: 180_000,
  },

  /** Cek session valid/invalid — cold WA Chrome + TG sidecar restore; tidak skala grup. */
  sessionCheck: {
    timeoutMs: 20_000,
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

/** Detect total Y device + X master — tetap, bukan scraper. */
export function syncDetectTimeoutMs(): number {
  return SYNC_SCRAPER_POLICY.syncDetect.timeoutMs;
}

/** @deprecated Pakai syncDetectTimeoutMs — detect tidak skala grup. */
export function manualSyncTimeoutMs(_estimate: number = 0): number {
  return syncDetectTimeoutMs();
}

/** Detect total setelah login QR — sama dengan syncDetect. */
export function postLoginDetectTimeoutMs(): number {
  return syncDetectTimeoutMs();
}

/** @deprecated Pakai postLoginDetectTimeoutMs — detect total tidak skala grup. */
export function postLoginSyncTimeoutMs(
  _estimate: number = 0,
): number {
  return postLoginDetectTimeoutMs();
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

export function deviceSessionProbeTimeoutMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.deviceSessionProbe, estimate);
}

export function deviceSessionWarmTimeoutMs(estimate = 0): number {
  return scaledPolicyMs(SYNC_SCRAPER_POLICY.deviceSessionWarm, estimate);
}
