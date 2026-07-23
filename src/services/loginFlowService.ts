import {
  LOGIN_PERSIST_TIMEOUT_MS,
  POST_LOGIN_GRACE_MS,
} from '@/services/syncFlowService';
import { fetchHasDailyData, fetchMasterGroupStatsForAccount } from '@/lib/accountSyncData';
import { todayScrapeDate } from '@/lib/accountMonitoringEngine';
import { isRowMisaligned, postSyncModalStep } from '@/lib/accountSyncUiFlow';
import { persistLoginSessionAfterSuccess } from '@/lib/persistLoginSession';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { hasActivePlatformSession } from '@/lib/platformSessions';
import { buildAccountSyncResult } from '@/lib/accountDisplayMetrics';
import { withNetworkRetry } from '@/lib/networkRetry';
import { withTimeout } from '@/lib/withTimeout';
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

/**
 * Setelah login sukses (intent Sync): **hanya** session + metrik grid/DB yang sudah ada.
 * Tidak hitung grup di device — Scrape nyata hanya lewat [Scrape Now].
 */
export async function applyDailyMetricsAfterLogin(input: {
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
  void input.dbAccountId;
  const hasDailyToday = await fetchHasDailyData(
    input.account.brandName,
    input.account.accountName,
    input.account.phoneNumber,
    input.account.platform,
    todayScrapeDate(),
  );

  const syncedAt = new Date().toISOString();
  const result: AccountSyncResult = {
    groupsCurrent: input.account.groupsCurrent,
    groupsTotal: input.account.groupsTotal,
    adminCurrent: input.account.adminCurrent,
    adminTotal: input.account.adminTotal,
    sessionStatus: 'valid',
  };
  const updatedAccount: AccountBrandRow = {
    ...input.account,
    status: 'active',
    sessionStatus: 'valid',
    syncState: 'synced',
    isMisaligned: isRowMisaligned(result),
    lastSyncAt: syncedAt,
  };

  return {
    updatedAccount,
    result,
    syncedAt,
    syncMessage:
      input.account.platform === 'telegram'
        ? 'Telegram session valid.'
        : 'WhatsApp session valid.',
    deviceGroupCount: hasDailyToday ? input.account.groupsCurrent : 0,
    hasDailyToday,
    countsReady:
      hasDailyToday || input.account.groupsCurrent > 0 || input.account.groupsTotal > 0,
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
  void input.account;
  return postSyncModalStep({
    result: input.result,
    deviceGroupCount: input.deviceGroupCount,
    hasDailyToday: input.hasDailyToday,
  });
}
