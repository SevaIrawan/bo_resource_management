import { gateDeviceSession } from '@/lib/deviceSessionGate';
import { invalidSessionMetricsFromDaily } from '@/lib/accountSessionUi';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import { invalidatePlatformSessionEverywhere } from '@/lib/platformSessionSync';
import {
  hasStoredPlatformSession,
} from '@/lib/sessionAvailability';
import { markPlatformSessionSynced } from '@/lib/platformSessions';
import { readLatestSessionUiStatus } from '@/lib/sessionUiFromDatabase';
import { isDeviceSessionDeadMessage } from '@/lib/scrapeErrorUi';
import { NETWORK_RETRY_ATTEMPTS, NETWORK_RETRY_BASE_DELAY_MS } from '@/lib/networkRetry';
import type { Platform } from '@/types/database';

const USER_SESSION_GATE_RETRIES = NETWORK_RETRY_ATTEMPTS;
const USER_SESSION_RETRY_BASE_MS = NETWORK_RETRY_BASE_DELAY_MS;

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

async function gateOnce(input: {
  sessionId: string;
  platform: Platform;
  dbAccountId: string;
  mode: UserSessionGateMode;
}) {
  return gateDeviceSession(
    {
      sessionId: input.sessionId,
      platform: input.platform,
      accountId: input.dbAccountId,
      uiSessionStatus: 'valid',
      skipWarmProbe: false,
    },
    input.mode,
  );
}

/**
 * Wajib untuk Sync / Run (aksi user):
 * 1. Baca status session terbaru di DB
 * 2. Probe strict ke device (probe → warm → probe); retry sekali jika masih loading
 * 3. Gagal tautan → invalidasi DB; sukses → tandai synced di DB
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

  let gate = await gateOnce(input);

  for (let attempt = 0; attempt < USER_SESSION_GATE_RETRIES - 1; attempt += 1) {
    if (gate.ok || gate.kind !== 'warm_pending') break;
    await new Promise((resolve) =>
      window.setTimeout(resolve, USER_SESSION_RETRY_BASE_MS * (attempt + 1)),
    );
    gate = await gateOnce(input);
  }

  if (gate.ok) {
    await markPlatformSessionSynced(input.dbAccountId);
    return { ok: true };
  }

  const hasStored = await hasStoredPlatformSession(input.dbAccountId, input.platform);
  const reloginCode = reloginCodeForAccount(input.hasDaily, hasStored);

  if (gate.kind === 'warm_pending') {
    return {
      ok: false,
      kind: 'device_failed',
      message: 'SESSION_CHECK_UNAVAILABLE',
      shouldInvalidate: true,
      reloginCode,
    };
  }

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
