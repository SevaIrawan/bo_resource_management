/**
 * Keputusan SYNC / RUN = kolom Session di baris grid (`account.sessionStatus`).
 * Spesifikasi lengkap: `sessionColumnFlowSpec.ts`
 */

import { sessionColumnRoute as routeImpl } from '@/lib/sessionColumnFlowSpec';
import { completeSyncAfterLiveSession, type SyncSuccessPayload } from '@/lib/syncAccountFlow';
import { verifyUserSessionForAction } from '@/lib/verifyUserSessionAction';
import {
  buildLogoutMetricsForUserAction,
  invalidateUserSessionOnDeviceFailure,
} from '@/lib/userActionSession';
import { hasStoredPlatformSession } from '@/lib/sessionAvailability';
import type { AccountBrandRow, SessionUiStatus } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export type SyncLoginReloginCode =
  | 'SESSION_INVALID_RELOGIN'
  | 'SESSION_INVALID_FORCE_SCRAPER';

export type SessionColumnAction = 'sync' | 'run';

export type SessionColumnRoute = 'open_login' | 'check_device';

/** Cabang wajib dari nilai kolom Session di UI. */
export function routeFromSessionColumn(sessionStatus: SessionUiStatus): SessionColumnRoute {
  return routeImpl(sessionStatus);
}

export function reloginCodeForSync(input: {
  hasStoredSession: boolean;
  hasDailyToday: boolean;
}): SyncLoginReloginCode {
  return input.hasStoredSession || input.hasDailyToday
    ? 'SESSION_INVALID_RELOGIN'
    : 'SESSION_INVALID_FORCE_SCRAPER';
}

export type DeviceSessionCheckResult =
  | { ok: true }
  | {
      ok: false;
      reloginCode: SyncLoginReloginCode;
      message: string;
      shouldInvalidate: boolean;
    };

/** Hanya bila kolom Session = VALID (setelah SYNC atau RUN). */
export async function checkDeviceSessionForValidColumn(input: {
  sessionId: string;
  platform: Platform;
  dbAccountId: string;
  action: SessionColumnAction;
  hasDailyToday?: boolean;
}): Promise<DeviceSessionCheckResult> {
  const gate = await verifyUserSessionForAction({
    sessionId: input.sessionId,
    platform: input.platform,
    dbAccountId: input.dbAccountId,
    mode: input.action === 'run' ? 'scrape' : 'sync',
    hasDaily: input.hasDailyToday,
  });

  if (gate.ok) {
    return { ok: true };
  }

  if (gate.kind === 'db_invalid') {
    const hasStored = await hasStoredPlatformSession(input.dbAccountId, input.platform);
    return {
      ok: false,
      reloginCode: reloginCodeForSync({
        hasStoredSession: hasStored,
        hasDailyToday: Boolean(input.hasDailyToday),
      }),
      message: 'db_session_invalid',
      shouldInvalidate: false,
    };
  }

  return {
    ok: false,
    reloginCode: gate.reloginCode,
    message: gate.message,
    shouldInvalidate: gate.shouldInvalidate,
  };
}

export async function detectGroupsAndBuildSyncPayload(input: {
  userId: string;
  account: AccountBrandRow;
  dbAccountId: string;
  brandStandardHint: number;
  skipPersist?: boolean;
  quickDeviceCount?: boolean;
}): Promise<SyncSuccessPayload> {
  return completeSyncAfterLiveSession({
    userId: input.userId,
    account: input.account,
    dbAccountId: input.dbAccountId,
    brandStandardHint: input.brandStandardHint,
    skipPersist: input.skipPersist,
    assumeSessionValid: true,
    quickDeviceCount: input.quickDeviceCount,
  });
}

export async function buildLogoutRowAfterDeviceFailure(input: {
  dbAccountId: string;
  brand: string;
  platform: Platform;
  brandStandard: number;
  message: string;
  shouldInvalidate: boolean;
}) {
  await invalidateUserSessionOnDeviceFailure({
    dbAccountId: input.dbAccountId,
    platform: input.platform,
    message: input.message,
    shouldInvalidate: input.shouldInvalidate,
  });

  return buildLogoutMetricsForUserAction({
    dbAccountId: input.dbAccountId,
    brand: input.brand,
    platform: input.platform,
    brandStandard: input.brandStandard,
  });
}
