import { gateDeviceSession } from '@/lib/deviceSessionGate';
import { invalidSessionMetricsFromDaily } from '@/lib/accountSessionUi';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import { invalidatePlatformSessionEverywhere } from '@/lib/platformSessionSync';
import { hasStoredPlatformSession } from '@/lib/sessionAvailability';
import { markPlatformSessionSynced } from '@/lib/platformSessions';
import { readLatestSessionUiStatus } from '@/lib/sessionUiFromDatabase';
import { isDeviceSessionDeadMessage } from '@/lib/scrapeErrorUi';
import type { Platform } from '@/types/database';

export type UserSessionGateMode = 'sync' | 'scrape';

export type UserSessionCheckResult =
  | { ok: true }
  | {
      ok: false;
      kind: 'db_invalid';
      reloginCode: 'SESSION_INVALID_RELOGIN' | 'SESSION_INVALID_FORCE_SCRAPER';
    }
  | {
      ok: false;
      kind: 'device_busy';
      message: string;
    }
  | {
      ok: false;
      kind: 'device_failed';
      message: string;
      shouldInvalidate: boolean;
      reloginCode: 'SESSION_INVALID_RELOGIN' | 'SESSION_INVALID_FORCE_SCRAPER';
    };

function reloginCodeForAccount(
  hasDaily: boolean | undefined,
  hasStored: boolean,
): 'SESSION_INVALID_RELOGIN' | 'SESSION_INVALID_FORCE_SCRAPER' {
  return hasDaily || hasStored
    ? 'SESSION_INVALID_RELOGIN'
    : 'SESSION_INVALID_FORCE_SCRAPER';
}

/**
 * Sync / Run: DB valid → probe (Sync=light, Scrape=strict) → lanjut / login.
 * Sync tidak pernah surface busy/timeout sebagai blocker (session tersimpan = Valid).
 */
export async function checkUserActionDeviceSession(input: {
  sessionId: string;
  platform: Platform;
  dbAccountId: string;
  mode: UserSessionGateMode;
  hasDaily?: boolean;
}): Promise<UserSessionCheckResult> {
  const dbSessionStatus = await readLatestSessionUiStatus(input.dbAccountId);

  if (dbSessionStatus === 'invalid') {
    const hasStored = await hasStoredPlatformSession(input.dbAccountId, input.platform);
    return {
      ok: false,
      kind: 'db_invalid',
      reloginCode: reloginCodeForAccount(input.hasDaily, hasStored),
    };
  }

  const gate = await gateDeviceSession(
    {
      sessionId: input.sessionId,
      platform: input.platform,
      accountId: input.dbAccountId,
      uiSessionStatus: 'valid',
    },
    input.mode,
  );

  if (gate.ok) {
    await markPlatformSessionSynced(input.dbAccountId);
    return { ok: true };
  }

  if (!gate.shouldInvalidate) {
    if (input.mode === 'sync') {
      const hasStored = await hasStoredPlatformSession(input.dbAccountId, input.platform);
      if (hasStored) {
        await markPlatformSessionSynced(input.dbAccountId);
        return { ok: true };
      }
    }
    return {
      ok: false,
      kind: 'device_busy',
      message: gate.message,
    };
  }

  const hasStored = await hasStoredPlatformSession(input.dbAccountId, input.platform);
  const reloginCode = reloginCodeForAccount(input.hasDaily, hasStored);

  return {
    ok: false,
    kind: 'device_failed',
    message: gate.message,
    shouldInvalidate: gate.shouldInvalidate,
    reloginCode,
  };
}

export async function invalidateUserSessionOnDeviceFailure(input: {
  dbAccountId: string;
  platform: Platform;
  message: string;
  shouldInvalidate: boolean;
}): Promise<void> {
  if (!input.shouldInvalidate && !isDeviceSessionDeadMessage(input.message)) {
    return;
  }

  await invalidatePlatformSessionEverywhere(
    input.dbAccountId,
    input.message,
    input.platform,
    {
      purgeWaDisk:
        input.platform === 'whatsapp' && isDeviceSessionDeadMessage(input.message),
    },
  );
}

export async function buildLogoutMetricsForUserAction(input: {
  dbAccountId: string;
  brand: string;
  platform: Platform;
  brandStandard: number;
}): Promise<AccountSyncResult> {
  return invalidSessionMetricsFromDaily({
    accountId: input.dbAccountId,
    brand: input.brand,
    platform: input.platform,
    brandStandard: input.brandStandard,
  });
}
