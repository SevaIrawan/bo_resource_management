import { sessionCheckTimeoutMs } from '@/config/syncScraperPolicy';
import { hasStoredPlatformSession } from '@/lib/sessionAvailability';
import { probePlatformSession } from '@/lib/sessionProbe';
import { OperationTimeoutError, withTimeout } from '@/lib/withTimeout';
import type { Platform } from '@/types/database';
import type { SessionUiStatus } from '@/types/accountMonitoringUi';

export type DeviceSessionGateMode = 'sync' | 'scrape';

export type DeviceSessionGateResult =
  | { ok: true }
  | {
      ok: false;
      kind: 'need_login';
      relogin: boolean;
      message: string;
      shouldInvalidate: boolean;
    };

async function probeSessionLinked(input: {
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
      sessionCheckTimeoutMs(),
      'Session check',
    );
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      return { valid: false, message: 'Session check timed out' };
    }
    throw error;
  }
}

function needLoginResult(msg: string): DeviceSessionGateResult {
  return {
    ok: false,
    kind: 'need_login',
    relogin: true,
    message: msg,
    shouldInvalidate: true,
  };
}

/**
 * Sync / Run: probe valid/invalid — 1 akun, getState saja (≤3s).
 * Tidak baca daftar grup; timeout tidak skala Y/X.
 * skipWarmProbe hanya tepat setelah login berhasil.
 */
async function gateUserActionSession(
  input: {
    sessionId: string;
    platform: Platform;
    accountId: string;
    skipWarmProbe?: boolean;
  },
  _hasStored: boolean,
  _mode: DeviceSessionGateMode,
): Promise<DeviceSessionGateResult> {
  if (input.skipWarmProbe) {
    return { ok: true };
  }

  const probe = await probeSessionLinked(input);
  if (probe.valid) {
    return { ok: true };
  }

  return needLoginResult(probe.message ?? 'device_not_connected');
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
  void mode;
  return gateUserActionSession(input, hasStored, mode);
}
