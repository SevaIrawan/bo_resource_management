import { postLoginDetectTimeoutMs, SYNC_SCRAPER_POLICY } from '@/config/syncScraperPolicy';
import { cancelDeviceGroupCount } from '@/lib/runAccountCount';
import { OperationTimeoutError, withTimeout } from '@/lib/withTimeout';
import {
  detectGroupsAndBuildSyncPayload,
  LOGIN_PERSIST_TIMEOUT_MS,
  POST_LOGIN_GRACE_MS,
} from '@/services/syncFlowService';
import { fetchMasterGroupStatsForAccount } from '@/lib/accountSyncData';
import { isRowMisaligned, postSyncModalStep } from '@/lib/accountSyncUiFlow';
import { persistLoginSessionAfterSuccess } from '@/lib/persistLoginSession';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { hasActivePlatformSession } from '@/lib/platformSessions';
import { buildAccountSyncResult } from '@/lib/accountDisplayMetrics';
import { withNetworkRetry } from '@/lib/networkRetry';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

export { LOGIN_PERSIST_TIMEOUT_MS, POST_LOGIN_GRACE_MS };

export async function persistSessionAfterLogin(input: {
  userId: string;
  account: AccountBrandRow;
}): Promise<string> {
  const resolved = await resolveDbAccountForRow({
    userId: input.userId,
    account: input.account,
  });

  await withNetworkRetry('Save session after login', () =>
    withTimeout(
      persistLoginSessionAfterSuccess({ userId: input.userId, account: input.account }),
      LOGIN_PERSIST_TIMEOUT_MS,
      'Save session after login',
    ),
  );

  return resolved.accountId;
}

export async function applyDailyMetricsAfterLogin(input: {
  userId: string;
  account: AccountBrandRow;
  dbAccountId: string;
}): Promise<{
  updatedAccount: AccountBrandRow;
  result: AccountSyncResult;
  syncedAt: string;
  syncMessage: string;
  deviceGroupCount: number;
  hasDailyToday: boolean;
  countsReady: boolean;
}> {
  const master = await fetchMasterGroupStatsForAccount({
    accountId: input.dbAccountId,
    brand: input.account.brandName,
    platform: input.account.platform,
  });

  let syncPayload: Awaited<ReturnType<typeof detectGroupsAndBuildSyncPayload>>;
  try {
    syncPayload = await withNetworkRetry('Post-login sync', () =>
      withTimeout(
        detectGroupsAndBuildSyncPayload({
          userId: input.userId,
          account: input.account,
          dbAccountId: input.dbAccountId,
          brandStandardHint: master.brandMasterTotal,
          skipPersist: true,
          quickDeviceCount: true,
          freshLogin: true,
        }),
        postLoginDetectTimeoutMs(),
        'Sync after login',
      ),
    );
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      void cancelDeviceGroupCount({
        sessionId: input.account.id,
        platform: input.account.platform,
        accountId: input.dbAccountId,
      });
    }
    throw error;
  }

  const syncedAt = new Date().toISOString();
  const result: AccountSyncResult = {
    ...syncPayload.result,
    sessionStatus: 'valid',
  };
  const updatedAccount: AccountBrandRow = {
    ...input.account,
    ...result,
    status: 'active',
    sessionStatus: 'valid',
    isMisaligned: isRowMisaligned(result),
    lastSyncAt: syncedAt,
  };

  const deviceGroupCount = syncPayload.deviceGroupCount;
  const countsReady = deviceGroupCount > 0 || result.groupsCurrent > 0;

  return {
    updatedAccount,
    result,
    syncedAt,
    syncMessage: syncPayload.syncMessage,
    deviceGroupCount,
    hasDailyToday: syncPayload.hasDailyToday,
    countsReady,
  };
}

export async function recoverLoginMetricsIfPersisted(input: {
  persistedToDb: boolean;
  dbAccountId: string;
  account: AccountBrandRow;
}): Promise<{
  updatedAccount: AccountBrandRow;
  result: AccountSyncResult;
  syncedAt: string;
  masterJoined: number;
} | null> {
  if (!input.persistedToDb || !input.dbAccountId) return null;
  if (!(await hasActivePlatformSession(input.dbAccountId))) return null;

  try {
    const master = await fetchMasterGroupStatsForAccount({
      accountId: input.dbAccountId,
      brand: input.account.brandName,
      platform: input.account.platform,
    });
    const fallbackResult = buildAccountSyncResult({
      master,
      device: { valid: true, totalGroups: 0, adminGroups: 0 },
      brandStandard: master.brandMasterTotal,
    });
    const syncedAt = new Date().toISOString();
    return {
      updatedAccount: {
        ...input.account,
        ...fallbackResult,
        status: 'active',
        sessionStatus: 'valid',
        isMisaligned: isRowMisaligned(fallbackResult),
        lastSyncAt: syncedAt,
      },
      result: fallbackResult,
      syncedAt,
      masterJoined: master.joinedInMaster,
    };
  } catch {
    return null;
  }
}

export async function resolvePostLoginModalStep(input: {
  account: AccountBrandRow;
  result: AccountSyncResult;
  deviceGroupCount: number;
  hasDailyToday: boolean;
}) {
  return postSyncModalStep({
    result: input.result,
    deviceGroupCount: input.deviceGroupCount,
    hasDailyToday: input.hasDailyToday,
  });
}

export async function fetchBrandIdForAccount(dbAccountId: string): Promise<string | undefined> {
  const supabase = getSupabase();
  const row = await supabase
    ?.from(TABLES.messagingAccounts)
    .select('brand_id')
    .eq('id', dbAccountId)
    .maybeSingle();
  return row?.data?.brand_id as string | undefined;
}

export const LOGIN_GRACE_MS = SYNC_SCRAPER_POLICY.login.postLoginGraceMs;
