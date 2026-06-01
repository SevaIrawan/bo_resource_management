import { isProbeSkipMessage } from '@/lib/persistLoginSession';
import { hasStoredPlatformSession } from '@/lib/sessionAvailability';
import { probePlatformSession } from '@/lib/sessionProbe';
import { tryWarmPlatformSession } from '@/lib/warmPlatformSession';
import { OperationTimeoutError, withTimeout } from '@/lib/withTimeout';
import type { Platform } from '@/types/database';
import type { SessionUiStatus } from '@/types/accountMonitoringUi';

export const DEVICE_WARM_MS = 20_000;
export const DEVICE_PROBE_MS = 20_000;

export type DeviceSessionGateMode = 'sync' | 'scrape';

export type DeviceSessionGateResult =
  | { ok: true }
  | { ok: false; kind: 'warm_pending' }
  | {
      ok: false;
      kind: 'need_login';
      relogin: boolean;
      message: string;
      shouldInvalidate: boolean;
    };

async function warmDevice(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
}): Promise<boolean> {
  if (!window.electronAPI?.platformLogin?.tryRestore) return false;
  return withTimeout(
    tryWarmPlatformSession(input),
    DEVICE_WARM_MS,
    'Restore device session',
  ).catch(() => false);
}

async function probeDeviceStrict(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
}): Promise<{ valid: boolean; message?: string }> {
  try {
    return await withTimeout(
      probePlatformSession({
        ...input,
        strict: true,
      }),
      DEVICE_PROBE_MS,
      'Session check',
    );
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      return { valid: false, message: 'Session check timed out' };
    }
    throw error;
  }
}

function needLoginResult(
  msg: string,
  shouldInvalidate: boolean,
): DeviceSessionGateResult {
  return {
    ok: false,
    kind: 'need_login',
    relogin: true,
    message: msg,
    shouldInvalidate,
  };
}

/** Probe dulu (client login mungkin sudah hidup) — baru warm, hindari Puppeteer ganda. */
async function probeThenWarm(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
}): Promise<{ valid: boolean; message?: string }> {
  let probe = await probeDeviceStrict(input);
  if (probe.valid) return probe;

  if (await warmDevice(input)) {
    return { valid: true, message: undefined };
  }

  probe = await probeDeviceStrict(input);
  return probe;
}

/** Sync: gagal = login ulang (tanpa warm_pending). */
async function gateSyncSession(
  input: {
    sessionId: string;
    platform: Platform;
    accountId: string;
    uiSessionStatus?: SessionUiStatus;
    skipWarmProbe?: boolean;
  },
  hasStored: boolean,
): Promise<DeviceSessionGateResult> {
  if (input.skipWarmProbe) {
    return { ok: true };
  }

  // UI VALID + session di DB — probe saja; warm memutus client TG/WA aktif (sync lama / hang).
  if (input.uiSessionStatus === 'valid' && hasStored) {
    const probe = await probeDeviceStrict(input);
    if (probe.valid) {
      return { ok: true };
    }
    const msg = probe.message ?? 'device_not_connected';
    const isTimeout = msg.toLowerCase().includes('timed out');
    return needLoginResult(msg, !isTimeout && !isProbeSkipMessage(msg) && hasStored);
  }

  const probe = await probeThenWarm(input);
  if (probe.valid) {
    return { ok: true };
  }

  const msg = probe.message ?? 'device_not_connected';
  const isTimeout = msg.toLowerCase().includes('timed out');
  return needLoginResult(msg, !isTimeout && !isProbeSkipMessage(msg) && hasStored);
}

/** Scrape / RUN: UI valid + skipWarmProbe = lolos; else probe→warm. */
async function gateScrapeSession(
  input: {
    sessionId: string;
    platform: Platform;
    accountId: string;
    uiSessionStatus: SessionUiStatus;
    skipWarmProbe?: boolean;
  },
  hasStored: boolean,
): Promise<DeviceSessionGateResult> {
  const uiStillValid = input.uiSessionStatus === 'valid';

  if (input.skipWarmProbe && uiStillValid) {
    return { ok: true };
  }

  const probe = await probeThenWarm(input);
  if (probe.valid) {
    return { ok: true };
  }

  const msg = probe.message ?? 'device_not_connected';
  const isTimeout = msg.toLowerCase().includes('timed out');

  if (uiStillValid && hasStored && (isTimeout || isProbeSkipMessage(msg))) {
    return { ok: false, kind: 'warm_pending' };
  }

  return needLoginResult(msg, !isTimeout && !isProbeSkipMessage(msg));
}

export async function gateDeviceSession(
  input: {
    sessionId: string;
    platform: Platform;
    accountId: string;
    uiSessionStatus: SessionUiStatus;
    hasDaily?: boolean;
    skipWarmProbe?: boolean;
  },
  mode: DeviceSessionGateMode = 'scrape',
): Promise<DeviceSessionGateResult> {
  const hasStored = await hasStoredPlatformSession(input.accountId, input.platform);

  if (mode === 'sync') {
    return gateSyncSession(input, hasStored);
  }

  return gateScrapeSession(input, hasStored);
}
