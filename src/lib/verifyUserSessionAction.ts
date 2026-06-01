import { gateDeviceSession } from '@/lib/deviceSessionGate';
import { readLatestSessionUiStatus } from '@/lib/sessionUiFromDatabase';
import { hasStoredPlatformSession } from '@/lib/sessionAvailability';
import { scrapeFailureNeedsLoginModal } from '@/lib/scrapeErrorUi';
import type { Platform } from '@/types/database';

export type UserSessionGateMode = 'sync' | 'scrape';

export type VerifyUserSessionResult =
  | { ok: true; dbSessionStatus: 'valid' }
  | {
      ok: false;
      kind: 'db_invalid';
      reloginCode: 'SESSION_INVALID_RELOGIN' | 'SESSION_INVALID_FORCE_SCRAPER';
    }
  | {
      ok: false;
      kind: 'device_failed';
      warmPending?: boolean;
      message: string;
      shouldInvalidate: boolean;
      reloginCode: 'SESSION_INVALID_RELOGIN' | 'SESSION_INVALID_FORCE_SCRAPER';
    };

/**
 * Urutan user action (Sync / Run scraper):
 * 1. Baca session terbaru di DB → sync badge UI
 * 2. DB invalid → login (tanpa probe device)
 * 3. DB valid → wajib probe device (probe → warm → probe)
 */
export async function verifyUserSessionForAction(input: {
  sessionId: string;
  platform: Platform;
  dbAccountId: string;
  mode: UserSessionGateMode;
  hasDaily?: boolean;
}): Promise<VerifyUserSessionResult> {
  const dbSessionStatus = await readLatestSessionUiStatus(input.dbAccountId);

  if (dbSessionStatus === 'invalid') {
    const hasStored = await hasStoredPlatformSession(input.dbAccountId, input.platform);
    return {
      ok: false,
      kind: 'db_invalid',
      reloginCode: hasStored ? 'SESSION_INVALID_RELOGIN' : 'SESSION_INVALID_FORCE_SCRAPER',
    };
  }

  const gate = await gateDeviceSession(
    {
      sessionId: input.sessionId,
      platform: input.platform,
      accountId: input.dbAccountId,
      uiSessionStatus: 'valid',
      hasDaily: input.hasDaily,
      skipWarmProbe: false,
    },
    input.mode,
  );

  if (gate.ok) {
    return { ok: true, dbSessionStatus: 'valid' };
  }

  if (gate.kind === 'warm_pending') {
    return {
      ok: false,
      kind: 'device_failed',
      warmPending: true,
      message: 'SESSION_WARM_PENDING',
      shouldInvalidate: false,
      reloginCode: 'SESSION_INVALID_RELOGIN',
    };
  }

  if (!scrapeFailureNeedsLoginModal(gate.message)) {
    return {
      ok: false,
      kind: 'device_failed',
      warmPending: true,
      message: gate.message,
      shouldInvalidate: false,
      reloginCode: 'SESSION_INVALID_RELOGIN',
    };
  }

  const hasStored = await hasStoredPlatformSession(input.dbAccountId, input.platform);
  return {
    ok: false,
    kind: 'device_failed',
    message: gate.message,
    shouldInvalidate: gate.shouldInvalidate,
    reloginCode:
      gate.relogin && (input.hasDaily || hasStored)
        ? 'SESSION_INVALID_RELOGIN'
        : 'SESSION_INVALID_FORCE_SCRAPER',
  };
}
