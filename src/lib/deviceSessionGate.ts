import {
  deviceSessionProbeTimeoutMs,
  deviceSessionWarmTimeoutMs,
} from '@/config/syncScraperPolicy';
import { isProbeSkipMessage } from '@/lib/persistLoginSession';
import { isDeviceBusyMessage, isDeviceSessionDeadMessage } from '@/lib/scrapeErrorUi';
import { hasStoredPlatformSession } from '@/lib/sessionAvailability';
import { probePlatformSession } from '@/lib/sessionProbe';
import { tryWarmPlatformSession } from '@/lib/warmPlatformSession';
import { OperationTimeoutError, withTimeout } from '@/lib/withTimeout';
import type { Platform } from '@/types/database';
import type { SessionUiStatus } from '@/types/accountMonitoringUi';

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
  groupEstimate?: number;
}): Promise<boolean> {
  if (!window.electronAPI?.platformLogin?.tryRestore) return false;
  const warmMs = deviceSessionWarmTimeoutMs(input.groupEstimate ?? 0);
  return withTimeout(
    tryWarmPlatformSession(input),
    warmMs,
    'Restore device session',
  ).catch(() => false);
}

async function probeDeviceStrict(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
  groupEstimate?: number;
}): Promise<{ valid: boolean; message?: string }> {
  const probeMs = deviceSessionProbeTimeoutMs(input.groupEstimate ?? 0);
  try {
    return await withTimeout(
      probePlatformSession({
        ...input,
        strict: true,
      }),
      probeMs,
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

/** Probe → warm → probe lagi. Warm saja tidak pernah dianggap valid tanpa getState(). */
async function probeThenWarm(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
  groupEstimate?: number;
}): Promise<{ valid: boolean; message?: string }> {
  let probe = await probeDeviceStrict(input);
  if (probe.valid) return probe;

  if (isDeviceSessionDeadMessage(probe.message)) {
    return probe;
  }

  if (isDeviceBusyMessage(probe.message)) {
    await warmDevice(input);
    return probeDeviceStrict(input);
  }

  await warmDevice(input);
  probe = await probeDeviceStrict(input);
  return probe;
}

/**
 * Sync / Run (user action): DB valid tetap wajib cek device (probe → warm → probe).
 * skipWarmProbe hanya untuk internal tepat setelah login berhasil.
 */
async function gateUserActionSession(
  input: {
    sessionId: string;
    platform: Platform;
    accountId: string;
    skipWarmProbe?: boolean;
    groupEstimate?: number;
  },
  hasStored: boolean,
  _mode: DeviceSessionGateMode,
): Promise<DeviceSessionGateResult> {
  if (input.skipWarmProbe) {
    return { ok: true };
  }

  const probe = await probeThenWarm(input);
  if (probe.valid) {
    return { ok: true };
  }

  const msg = probe.message ?? 'device_not_connected';

  if (isDeviceSessionDeadMessage(msg)) {
    return needLoginResult(msg, true);
  }

  if (isDeviceBusyMessage(msg) || isProbeSkipMessage(msg)) {
    return needLoginResult(msg, hasStored);
  }

  return needLoginResult(msg, hasStored);
}

export async function gateDeviceSession(
  input: {
    sessionId: string;
    platform: Platform;
    accountId: string;
    uiSessionStatus: SessionUiStatus;
    hasDaily?: boolean;
    skipWarmProbe?: boolean;
    groupEstimate?: number;
  },
  mode: DeviceSessionGateMode = 'scrape',
): Promise<DeviceSessionGateResult> {
  const hasStored = await hasStoredPlatformSession(input.accountId, input.platform);
  void mode;
  return gateUserActionSession(input, hasStored, mode);
}
