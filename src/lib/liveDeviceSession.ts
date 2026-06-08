import { gateDeviceSession } from '@/lib/deviceSessionGate';
import type { Platform } from '@/types/database';
import type { SessionUiStatus } from '@/types/accountMonitoringUi';

export interface LiveSessionCheckInput {
  sessionId: string;
  platform: Platform;
  accountId: string;
  uiSessionStatus?: SessionUiStatus;
  /** Lewati warm/probe — pakai sesi yang baru saja login. */
  skipWarmProbe?: boolean;
}

/** Session hidup di device — probe cepat valid/invalid (≤3s). */
export async function requireLiveDeviceSession(
  input: LiveSessionCheckInput,
): Promise<{ ok: true } | { ok: false; message: string; shouldInvalidate?: boolean }> {
  if (!window.electronAPI?.isElectron) {
    return { ok: false, message: 'SCRAPER_DESKTOP_REQUIRED' };
  }

  const gate = await gateDeviceSession(
    {
      sessionId: input.sessionId,
      platform: input.platform,
      accountId: input.accountId,
      uiSessionStatus: input.uiSessionStatus ?? 'valid',
      skipWarmProbe: input.skipWarmProbe,
    },
    'scrape',
  );

  if (gate.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    message: gate.message,
    shouldInvalidate: gate.shouldInvalidate,
  };
}
