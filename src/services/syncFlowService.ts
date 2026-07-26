/**
 * Sync / session-column routing — acuan logic_sync_scraper.txt + sessionColumnFlowSpec.
 * Sync Active = Check Session ke device → Now/Later (tanpa count/detect daftar grup).
 */
import { SYNC_SCRAPER_POLICY } from '@/config/syncScraperPolicy';
import { todayScrapeDate } from '@/lib/accountMonitoringEngine';
import {
  fetchHasDailyData,
  fetchMasterGroupStatsForAccount,
} from '@/lib/accountSyncData';
import { ensurePlatformSessionInDatabase } from '@/lib/ensureWaSessionInDb';
import { hasStoredPlatformSession } from '@/lib/sessionAvailability';
import { recordSyncActivity } from '@/lib/syncActivityLog';
import { isRowMisaligned, postSyncModalStep, type PostSyncModalStep } from '@/lib/accountSyncUiFlow';
import { sessionColumnRoute } from '@/lib/sessionColumnFlowSpec';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { verifyUserSessionForAction } from '@/lib/verifyUserSessionAction';
import {
  buildLogoutMetricsForUserAction,
  invalidateUserSessionOnDeviceFailure,
} from '@/lib/userActionSession';
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

async function loadMasterForAccount(account: AccountBrandRow, dbAccountId: string) {
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
      kind: 'busy';
      dbAccountId: string;
      message: string;
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
    };

function buildSyncValidSuccess(input: {
  account: AccountBrandRow;
  dbAccountId: string;
  brandX: number;
  masterJoined: number;
  hasDaily: boolean;
}): Extract<SyncCheckOutcome, { kind: 'success' }> {
  const { account, dbAccountId, brandX, masterJoined, hasDaily } = input;
  const syncedAt = new Date().toISOString();
  const result: AccountSyncResult = {
    groupsCurrent: account.groupsCurrent,
    groupsTotal: brandX,
    adminCurrent: account.adminCurrent,
    adminTotal: brandX,
    sessionStatus: 'valid',
  };
  const updatedAccount: AccountBrandRow = {
    ...account,
    status: 'active',
    sessionStatus: 'valid',
    syncState: 'synced',
    isMisaligned: isRowMisaligned(result),
  };

  return {
    kind: 'success',
    dbAccountId,
    result,
    masterJoined,
    syncedAt,
    syncMessage:
      account.platform === 'telegram'
        ? 'Telegram session valid.'
        : 'WhatsApp session valid.',
    modalStep: postSyncModalStep({
      result,
      deviceGroupCount: hasDaily ? account.groupsCurrent : 0,
      hasDailyToday: hasDaily,
    }),
    updatedAccount,
  };
}

export async function executeSyncCheck(input: {
  userId: string;
  account: AccountBrandRow;
  dbAccountId: string;
  onSessionProbeComplete?: () => void;
}): Promise<SyncCheckOutcome> {
  const { account, dbAccountId } = input;
  void input.userId;

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

  /** Sync: Check Session langsung ke device — Valid hanya jika device linked. */
  const deviceCheck = await checkDeviceSessionForValidColumn({
    sessionId: account.id,
    platform: account.platform,
    dbAccountId,
    action: 'sync',
    hasDailyToday: hasDaily,
  });

  if (!deviceCheck.ok && deviceCheck.busy) {
    return {
      kind: 'busy',
      dbAccountId,
      message: deviceCheck.message,
    };
  }

  if (!deviceCheck.ok) {
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

  /** Probe device OK — metrik Y/X grid tetap dari scrape / DB (bukan count di Sync). */
  input.onSessionProbeComplete?.();

  return buildSyncValidSuccess({
    account,
    dbAccountId,
    brandX,
    masterJoined: master.joinedInMaster,
    hasDaily,
  });
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
