/**
 * Sync / session-column routing — acuan logic_sync_scraper.txt + sessionColumnFlowSpec.
 * Satu modul: routing INVALID/VALID, probe device, payload sync.
 */
import { syncDetectTimeoutMs, SYNC_SCRAPER_POLICY } from '@/config/syncScraperPolicy';
import { todayScrapeDate } from '@/lib/accountMonitoringEngine';
import {
  fetchHasDailyData,
  fetchMasterGroupStatsForAccount,
} from '@/lib/accountSyncData';
import { ensurePlatformSessionInDatabase } from '@/lib/ensureWaSessionInDb';
import { backfillPlatformSessionIfNeeded, hasStoredPlatformSession } from '@/lib/sessionAvailability';
import { recordSyncActivity } from '@/lib/syncActivityLog';
import { isRowMisaligned, postSyncModalStep, type PostSyncModalStep } from '@/lib/accountSyncUiFlow';
import { sessionColumnRoute } from '@/lib/sessionColumnFlowSpec';
import { completeSyncAfterLiveSession, type SyncSuccessPayload } from '@/lib/syncAccountFlow';
import { buildMetricsFromScrapeDaily } from '@/lib/accountSyncData';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { verifyUserSessionForAction } from '@/lib/verifyUserSessionAction';
import { isAccountInSessionGrace } from '@/lib/sessionRealtimePolicy';
import {
  buildLogoutMetricsForUserAction,
  invalidateUserSessionOnDeviceFailure,
} from '@/lib/userActionSession';
import { cancelDeviceGroupCount } from '@/lib/runAccountCount';
import { withNetworkRetry } from '@/lib/networkRetry';
import { OperationTimeoutError, withTimeout } from '@/lib/withTimeout';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import type { AccountBrandRow, SessionUiStatus } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export const LOGIN_PERSIST_TIMEOUT_MS = SYNC_SCRAPER_POLICY.login.persistTimeoutMs;
export const POST_LOGIN_GRACE_MS = SYNC_SCRAPER_POLICY.login.postLoginGraceMs;

export type SyncLoginReloginCode =
  | 'SESSION_INVALID_RELOGIN'
  | 'SESSION_INVALID_FORCE_SCRAPER';

export type SessionColumnAction = 'sync' | 'run';
export type SessionColumnRoute = 'open_login' | 'check_device';

export function routeFromSessionColumn(sessionStatus: SessionUiStatus): SessionColumnRoute {
  return sessionColumnRoute(sessionStatus);
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
  | { ok: false; busy: true; message: string }
  | {
      ok: false;
      busy?: false;
      reloginCode: SyncLoginReloginCode;
      message: string;
      shouldInvalidate: boolean;
    };

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

  if (gate.kind === 'device_busy') {
    return { ok: false, busy: true, message: gate.message };
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
  freshLogin?: boolean;
}): Promise<SyncSuccessPayload> {
  return completeSyncAfterLiveSession({
    userId: input.userId,
    account: input.account,
    dbAccountId: input.dbAccountId,
    brandStandardHint: input.brandStandardHint,
    skipPersist: input.skipPersist,
    assumeSessionValid: true,
    quickDeviceCount: input.quickDeviceCount,
    freshLogin: input.freshLogin,
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

async function loadMasterForAccount(
  account: AccountBrandRow,
  dbAccountId: string,
) {
  return fetchMasterGroupStatsForAccount({
    accountId: dbAccountId,
    brand: account.brandName,
    platform: account.platform,
  });
}

export type SyncCheckOutcome =
  | {
      kind: 'login';
      reloginCode: SyncLoginReloginCode;
      dbAccountId: string;
    }
  | {
      kind: 'invalidated-login';
      reloginCode: SyncLoginReloginCode;
      dbAccountId: string;
      invalidResult: AccountSyncResult;
      masterJoined: number;
      deviceMessage: string;
    }
  | {
      kind: 'success';
      dbAccountId: string;
      result: AccountSyncResult;
      masterJoined: number;
      syncedAt: string;
      syncMessage: string;
      modalStep: PostSyncModalStep;
      updatedAccount: AccountBrandRow;
    }
  | { kind: 'device_busy'; message: string; dbAccountId: string }
  | { kind: 'error'; code: 'SYNC_TIMED_OUT' | 'SYNC_FAILED' };

export async function executeSyncCheck(input: {
  userId: string;
  account: AccountBrandRow;
  dbAccountId: string;
  onSessionProbeComplete?: () => void;
}): Promise<SyncCheckOutcome> {
  const { account, dbAccountId, userId } = input;

  if (routeFromSessionColumn(account.sessionStatus) === 'open_login') {
    const hasStored = await hasStoredPlatformSession(dbAccountId, account.platform);
    const hasDaily = await fetchHasDailyData(
      account.brandName,
      account.accountName,
      account.phoneNumber,
      account.platform,
      todayScrapeDate(),
    );
    return {
      kind: 'login',
      reloginCode: reloginCodeForSync({ hasStoredSession: hasStored, hasDailyToday: hasDaily }),
      dbAccountId,
    };
  }

  const hasDaily = await fetchHasDailyData(
    account.brandName,
    account.accountName,
    account.phoneNumber,
    account.platform,
    todayScrapeDate(),
  );

  const master = await loadMasterForAccount(account, dbAccountId);
  const brandX = master.brandMasterTotal;

  if (account.platform === 'whatsapp') {
    await ensurePlatformSessionInDatabase({
      dbAccountId,
      uiSessionId: account.id,
      platform: account.platform,
    });
  }

  await backfillPlatformSessionIfNeeded({ userId, account, dbAccountId });

  const skipDeviceProbe = isAccountInSessionGrace(account.id);

  const deviceCheck = skipDeviceProbe
    ? ({ ok: true } as const)
    : await checkDeviceSessionForValidColumn({
        sessionId: account.id,
        platform: account.platform,
        dbAccountId,
        action: 'sync',
        hasDailyToday: hasDaily,
      });

  if (!deviceCheck.ok) {
    if (deviceCheck.busy) {
      return {
        kind: 'device_busy',
        message: deviceCheck.message,
        dbAccountId,
      };
    }

    const invalidResult = await buildLogoutRowAfterDeviceFailure({
      dbAccountId,
      brand: account.brandName,
      platform: account.platform,
      brandStandard: brandX,
      message: deviceCheck.message,
      shouldInvalidate: deviceCheck.shouldInvalidate,
    });

    return {
      kind: 'invalidated-login',
      reloginCode: deviceCheck.reloginCode,
      dbAccountId,
      invalidResult,
      masterJoined: master.joinedInMaster,
      deviceMessage: deviceCheck.message,
    };
  }

  input.onSessionProbeComplete?.();

  try {
    const syncPayload = await withNetworkRetry('Manual sync', () =>
      withTimeout(
        detectGroupsAndBuildSyncPayload({
          userId,
          account,
          dbAccountId,
          brandStandardHint: brandX,
          quickDeviceCount: true,
        }),
        syncDetectTimeoutMs(),
        'Manual sync',
      ),
    );

    let result = syncPayload.result;
    if (syncPayload.hasDailyToday) {
      const fromDaily = await buildMetricsFromScrapeDaily({
        accountId: dbAccountId,
        brand: account.brandName,
        platform: account.platform,
        sessionValid: true,
        forceFresh: true,
      });
      result = fromDaily.result;
    }

    const syncedAt = new Date().toISOString();
    const updatedAccount: AccountBrandRow = {
      ...account,
      ...result,
      joinedInMaster: syncPayload.masterJoined,
      status: 'active',
      sessionStatus: 'valid',
      isMisaligned: isRowMisaligned(result),
    };

    return {
      kind: 'success',
      dbAccountId,
      result,
      masterJoined: syncPayload.masterJoined,
      syncedAt,
      syncMessage: syncPayload.syncMessage,
      modalStep: postSyncModalStep({
        result,
        deviceGroupCount: syncPayload.deviceGroupCount,
        hasDailyToday: syncPayload.hasDailyToday,
      }),
      updatedAccount,
    };
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      void cancelDeviceGroupCount({
        sessionId: account.id,
        platform: account.platform,
        accountId: dbAccountId,
      });
      return { kind: 'error', code: 'SYNC_TIMED_OUT' };
    }
    return { kind: 'error', code: 'SYNC_FAILED' };
  }
}

export async function recordSyncCheckActivity(input: {
  dbAccountId: string;
  account: AccountBrandRow;
  outcome: Extract<SyncCheckOutcome, { kind: 'success' }>;
}): Promise<void> {
  await recordSyncActivity({
    accountId: input.dbAccountId,
    platform: input.account.platform,
    syncSource: 'manual',
    sessionStatus: 'valid',
    deviceGroups: input.outcome.result.groupsCurrent,
    brandGroups: input.outcome.result.groupsTotal,
    adminGroups: input.outcome.result.adminCurrent,
    message: input.outcome.syncMessage,
  });
}

export async function resolveDbAccountId(input: {
  userId: string;
  account: AccountBrandRow;
  knownDbAccountId?: string;
}): Promise<string> {
  if (input.knownDbAccountId) return input.knownDbAccountId;
  const { accountId } = await resolveDbAccountForRow({
    userId: input.userId,
    account: input.account,
  });
  return accountId;
}

export async function runSyncCheckFlow(input: {
  userId: string;
  account: AccountBrandRow;
  onSessionProbeComplete?: () => void;
}): Promise<{ dbAccountId: string; outcome: SyncCheckOutcome }> {
  const dbAccountId = await resolveDbAccountId(input);
  const outcome = await executeSyncCheck({
    userId: input.userId,
    account: input.account,
    dbAccountId,
    onSessionProbeComplete: input.onSessionProbeComplete,
  });
  return { dbAccountId, outcome };
}
