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
  hasActivePlatformSession,
  markPlatformSessionSynced,
} from '@/lib/platformSessions';
import { recordSessionActivityStatus } from '@/lib/recordSessionActivity';
import { recordSyncActivity } from '@/lib/syncActivityLog';
import { probePlatformSession } from '@/lib/sessionProbe';
import { getSupabase } from '@/lib/supabase';
import { TABLES } from '@/config/tables';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { SyncActivitySource } from '@/lib/syncActivityLog';

const AUTO_PROBE_TIMEOUT_MS = 45_000;

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

/**
 * Satu putaran sync tanpa modal: cek session live + grup di device, catat DB, kembalikan metrik.
 */
export async function runAccountSyncCheck(
  input: RunAccountSyncCheckInput,
): Promise<RunAccountSyncCheckOutput | null> {
  const { userId, group, account, syncSource } = input;

  if (!window.electronAPI?.isElectron) return null;
  if (!hasValidAccountPhone(account.phoneNumber)) return null;

  const { accountId: dbAccountId } = await resolveDbAccountForRow({ userId, account });

  if ((await readLatestSessionUiStatus(dbAccountId)) === 'invalid') {
    return null;
  }

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

  if (!hasSession) {
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

  const probe = await Promise.race([
    probePlatformSession({
      sessionId: account.id,
      platform: account.platform,
      accountId: dbAccountId,
      strict: true,
    }),
    new Promise<{ valid: false; message: string }>((resolve) =>
      setTimeout(
        () => resolve({ valid: false, message: 'Session check timed out' }),
        AUTO_PROBE_TIMEOUT_MS,
      ),
    ),
  ]);

  if (!probe.valid) {
    await recordSessionActivityStatus({
      accountId: dbAccountId,
      platform: account.platform,
      sessionStatus: 'logout',
      message: probe.message ?? `${syncSource}: device not connected`,
    });
    const metrics = await refreshAccountMetrics({
      account,
      dbAccountId,
      brandStandard,
    });
    const daily = await invalidSessionMetricsFromDaily({
      accountId: dbAccountId,
      brand: account.brandName,
      platform: account.platform,
      brandStandard,
    });
    const dbStillValid = await hasActivePlatformSession(dbAccountId);
    const result: AccountSyncResult = dbStillValid
      ? { ...daily, sessionStatus: 'valid' }
      : daily;
    await logActivity(result, probe.message);
    return { dbAccountId, result, masterJoined: metrics.master.joinedInMaster };
  }

  await markPlatformSessionSynced(dbAccountId);

  const metrics = await refreshAccountMetrics({
    account,
    dbAccountId,
    brandStandard,
  });

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
): AccountBrandGroup {
  const next = applySyncResultToGroup(group, accountId, output.result, {
    masterTotal: output.masterJoined,
  });
  return rebuildGroupMetrics(next);
}
