import {
  applySyncResultToGroup,
  rebuildGroupMetrics,
  type AccountSyncResult,
} from '@/lib/accountBrandUtils';
import { invalidSessionMetricsFromDaily } from '@/lib/accountSessionUi';
import { refreshAccountMetrics } from '@/lib/accountMonitoringEngine';
import { resolveBrandStandardTotal } from '@/lib/brandStandardCount';
import { hasValidAccountPhone } from '@/lib/accountPhone';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { backfillPlatformSessionIfNeeded, hasUsableLoginSession } from '@/lib/sessionAvailability';
import { readLatestSessionUiStatus } from '@/lib/sessionUiFromDatabase';
import { ensurePlatformSessionInDatabase } from '@/lib/ensureWaSessionInDb';
import {
  fetchActivePlatformSessions,
  markPlatformSessionInvalid,
  markPlatformSessionSynced,
} from '@/lib/platformSessions';
import { isDeviceBusyMessage, isDeviceSessionDeadMessage } from '@/lib/scrapeErrorUi';
import { recordSessionActivityStatus } from '@/lib/recordSessionActivity';
import { recordSyncActivity } from '@/lib/syncActivityLog';
import { probePlatformSession } from '@/lib/sessionProbe';
import { sessionCheckTimeoutMs, syncDetectTimeoutMs } from '@/config/syncScraperPolicy';
import { cancelDeviceGroupCount } from '@/lib/runAccountCount';
import { OperationTimeoutError, withTimeout } from '@/lib/withTimeout';
import { getSupabase } from '@/lib/supabase';
import { TABLES } from '@/config/tables';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { SyncActivitySource } from '@/lib/syncActivityLog';

export interface RunAccountSyncCheckInput {
  userId: string;
  group: AccountBrandGroup;
  account: AccountBrandRow;
  syncSource: SyncActivitySource;
}

export interface RunAccountSyncCheckOutput {
  dbAccountId: string;
  result: AccountSyncResult;
  masterJoined?: number;
}

function sessionStatusForActivity(
  result: AccountSyncResult,
): 'valid' | 'logout' | 'invalid' {
  if (result.sessionStatus === 'valid') return 'valid';
  return 'logout';
}

async function probeAutoSyncSession(input: {
  sessionId: string;
  platform: AccountBrandRow['platform'];
  accountId: string;
}): Promise<{ valid: boolean; message?: string }> {
  try {
    return await withTimeout(
      probePlatformSession({ ...input, strict: true }),
      sessionCheckTimeoutMs(),
      'Auto-sync session check',
    );
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      return { valid: false, message: 'Session check timed out' };
    }
    throw error;
  }
}

async function detectAutoSyncMetrics(input: {
  account: AccountBrandRow;
  dbAccountId: string;
  brandStandard: number;
}): Promise<Awaited<ReturnType<typeof refreshAccountMetrics>>> {
  try {
    return await withTimeout(
      refreshAccountMetrics({
        account: input.account,
        dbAccountId: input.dbAccountId,
        brandStandard: input.brandStandard,
        assumeSessionValid: true,
        quickDeviceCount: true,
        skipMergeDeviceGroups: true,
      }),
      syncDetectTimeoutMs(),
      'Auto-sync detect',
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
}

/**
 * Satu putaran sync tanpa modal: probe 3s + detect total cepat (sama kontrak manual sync).
 */
export async function runAccountSyncCheck(
  input: RunAccountSyncCheckInput,
): Promise<RunAccountSyncCheckOutput | null> {
  const { userId, group, account, syncSource } = input;

  if (!window.electronAPI?.isElectron) return null;
  if (!hasValidAccountPhone(account.phoneNumber)) return null;

  const { accountId: dbAccountId } = await resolveDbAccountForRow({ userId, account });

  const dbSaysValid = (await readLatestSessionUiStatus(dbAccountId)) === 'valid';

  if (account.platform === 'whatsapp') {
    await ensurePlatformSessionInDatabase({
      dbAccountId,
      uiSessionId: account.id,
      platform: account.platform,
    });
  }

  let brandStandard =
    account.groupsTotal > 0
      ? account.groupsTotal
      : group.standardGroupCountByPlatform?.[account.platform] ?? 0;

  const supabase = getSupabase();
  if (supabase) {
    const { data: accRow } = await supabase
      .from(TABLES.messagingAccounts)
      .select('brand_id')
      .eq('id', dbAccountId)
      .maybeSingle();
    const brandId = accRow?.brand_id as string | undefined;
    if (brandId) {
      brandStandard = await resolveBrandStandardTotal(
        brandId,
        account.platform,
        brandStandard,
        account.brandName,
      );
    }
  }

  const logActivity = async (result: AccountSyncResult, message?: string) => {
    const status = sessionStatusForActivity(result);
    await recordSyncActivity({
      accountId: dbAccountId,
      platform: account.platform,
      syncSource,
      sessionStatus: status,
      deviceGroups: result.groupsCurrent,
      brandGroups: result.groupsTotal,
      adminGroups: result.adminCurrent,
      message: message ?? status,
    });
  };

  const hasSession = await hasUsableLoginSession({
    sessionId: account.id,
    platform: account.platform,
    accountId: dbAccountId,
    accountName: account.accountName,
  });

  if (!hasSession && !dbSaysValid) {
    const result = await invalidSessionMetricsFromDaily({
      accountId: dbAccountId,
      brand: account.brandName,
      platform: account.platform,
      brandStandard,
    });
    await recordSessionActivityStatus({
      accountId: dbAccountId,
      platform: account.platform,
      sessionStatus: 'logout',
      message: `${syncSource}: no session in DB`,
    });
    await logActivity(result, 'no_session');
    return { dbAccountId, result };
  }

  await backfillPlatformSessionIfNeeded({ userId, account, dbAccountId });

  const probe = await probeAutoSyncSession({
    sessionId: account.id,
    platform: account.platform,
    accountId: dbAccountId,
  });

  if (!probe.valid) {
    const probeMessage = probe.message ?? `${syncSource}: device not connected`;

    if (isDeviceSessionDeadMessage(probeMessage)) {
      await markPlatformSessionInvalid(dbAccountId, probeMessage, account.platform);
      await recordSessionActivityStatus({
        accountId: dbAccountId,
        platform: account.platform,
        sessionStatus: 'logout',
        message: probeMessage,
      });
      const metrics = await refreshAccountMetrics({
        account,
        dbAccountId,
        brandStandard,
        quickDeviceCount: true,
        skipMergeDeviceGroups: true,
      }).catch(() => null);
      const result = await invalidSessionMetricsFromDaily({
        accountId: dbAccountId,
        brand: account.brandName,
        platform: account.platform,
        brandStandard,
      });
      await logActivity(result, probeMessage);
      return {
        dbAccountId,
        result,
        masterJoined: metrics?.master.joinedInMaster,
      };
    }

    if (isDeviceBusyMessage(probeMessage)) {
      return null;
    }

    return null;
  }

  await markPlatformSessionSynced(dbAccountId);

  let metrics: Awaited<ReturnType<typeof refreshAccountMetrics>>;
  try {
    metrics = await detectAutoSyncMetrics({ account, dbAccountId, brandStandard });
  } catch {
    return null;
  }

  const result = metrics.result;

  if (result.sessionStatus === 'valid') {
    const activeRows = await fetchActivePlatformSessions(dbAccountId);
    await recordSessionActivityStatus({
      accountId: dbAccountId,
      platform: account.platform,
      sessionStatus: 'valid',
      eventType: 'sync_valid',
      message: `${syncSource}: session valid, device groups checked`,
      platformSessionId: activeRows[0]?.id ?? null,
    });
  }

  await logActivity(
    result,
    `device=${result.groupsCurrent}/${result.groupsTotal}`,
  );

  return {
    dbAccountId,
    result,
    masterJoined: metrics.master.joinedInMaster,
  };
}

export function applySyncCheckToGroup(
  group: AccountBrandGroup,
  accountId: string,
  output: RunAccountSyncCheckOutput,
  lastSyncAt?: string,
): AccountBrandGroup {
  const next = applySyncResultToGroup(group, accountId, output.result, {
    masterTotal: output.masterJoined,
    lastSyncAt: lastSyncAt ?? new Date().toISOString(),
  });
  return rebuildGroupMetrics(next);
}
