import { sessionCheckTimeoutMs } from '@/config/syncScraperPolicy';
import { probePlatformSession } from '@/lib/sessionProbe';
import { isDeviceBusyMessage, isDeviceSessionDeadMessage } from '@/lib/scrapeErrorUi';
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

const PROBE_RETRY_DELAY_MS = 1_500;
const PROBE_MAX_ATTEMPTS = 3;

function probeFailureResult(msg: string): DeviceSessionGateResult {
  const dead = isDeviceSessionDeadMessage(msg);
  return {
    ok: false,
    kind: 'need_login',
    relogin: dead,
    message: msg,
    shouldInvalidate: dead,
  };
}

/** Sync & Scrape: probe langsung ke device (bukan disk / tebak session tersimpan). */
async function probeSessionOnDevice(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
}): Promise<{ valid: boolean; message?: string }> {
  const timeoutMs = sessionCheckTimeoutMs();
  let lastMessage = 'device_not_connected';

  for (let attempt = 0; attempt < PROBE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await withTimeout(
        probePlatformSession({
          ...input,
          strict: true,
        }),
        timeoutMs,
        'Session check',
      );
      if (result.valid) return result;
      lastMessage = result.message ?? lastMessage;
      const busy = isDeviceBusyMessage(lastMessage);
      if (!busy || attempt === PROBE_MAX_ATTEMPTS - 1) {
        return result;
      }
    } catch (error) {
      if (error instanceof OperationTimeoutError) {
        lastMessage = 'Session check timed out';
        if (attempt === PROBE_MAX_ATTEMPTS - 1) {
          return { valid: false, message: lastMessage };
        }
      } else {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_DELAY_MS));
  }

  return { valid: false, message: lastMessage };
}

async function gateDeviceProbe(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
}): Promise<DeviceSessionGateResult> {
  const probe = await probeSessionOnDevice(input);
  if (probe.valid) {
    return { ok: true };
  }
  return probeFailureResult(probe.message ?? 'device_not_connected');
}

export async function gateDeviceSession(
  input: {
    sessionId: string;
    platform: Platform;
    accountId: string;
    uiSessionStatus: SessionUiStatus;
    hasDaily?: boolean;
  },
  mode: DeviceSessionGateMode = 'scrape',
): Promise<DeviceSessionGateResult> {
  void mode;
  void input.uiSessionStatus;
  void input.hasDaily;
  return gateDeviceProbe({
    sessionId: input.sessionId,
    platform: input.platform,
    accountId: input.accountId,
  });
}
