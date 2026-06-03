import { refreshAccountMetrics, type RefreshAccountMetricsResult } from '@/lib/accountMonitoringEngine';
import { resolveBrandStandardTotal } from '@/lib/brandStandardCount';
import { persistLoginSessionAfterSuccess } from '@/lib/persistLoginSession';
import { recordSessionActivityStatus } from '@/lib/recordSessionActivity';
import { invalidSessionMetricsFromDaily } from '@/lib/accountSessionUi';
import { isDeviceSessionDeadMessage } from '@/lib/scrapeErrorUi';
import {
  fetchActivePlatformSessions,
  hasActivePlatformSession,
  markPlatformSessionInvalid,
  markPlatformSessionSynced,
} from '@/lib/platformSessions';
import { getSupabase } from '@/lib/supabase';
import { TABLES } from '@/config/tables';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

export interface SyncSuccessPayload {
  result: AccountSyncResult;
  masterJoined: number;
  brandStandard: number;
  deviceGroupCount: number;
  hasDailyToday: boolean;
  syncMessage: string;
}

/** Payload popup: DEVICE:y|BRAND:x|MASTER:m|ADMIN:a */
export function formatSyncMetricsMessage(input: {
  device: number;
  brand: number;
  master: number;
  admin: number;
}): string {
  return `DEVICE:${input.device}|BRAND:${input.brand}|MASTER:${input.master}|ADMIN:${input.admin}`;
}

/**
 * Step 1 / Step 2 selesai: session live OK → simpan ke DB, hitung grup brand + device, update metrik card.
 */
export async function completeSyncAfterLiveSession(input: {
  userId: string;
  account: AccountBrandRow;
  dbAccountId: string;
  brandStandardHint?: number;
  /** Sudah persist dari modal login — jangan skip export string Telethon. */
  skipPersist?: boolean;
  /** Sudah di-probe di Sync manual (badge VALID) — satu kali hitung grup, tanpa validate ulang. */
  assumeSessionValid?: boolean;
  /** Setelah login QR WA — count cepat lalu modal Scrape now / Later. */
  quickDeviceCount?: boolean;
}): Promise<SyncSuccessPayload> {
  if (!input.skipPersist) {
    const hasSession = await hasActivePlatformSession(input.dbAccountId);
    if (!hasSession) {
      await persistLoginSessionAfterSuccess({ userId: input.userId, account: input.account });
    } else {
      await markPlatformSessionSynced(input.dbAccountId);
    }
  }

  const supabase = getSupabase();
  let brandStandard = input.brandStandardHint ?? 0;

  if (supabase) {
    const { data: accRow } = await supabase
      .from(TABLES.messagingAccounts)
      .select('brand_id')
      .eq('id', input.dbAccountId)
      .maybeSingle();
    const brandId = accRow?.brand_id as string | undefined;
    if (brandId) {
      brandStandard = await resolveBrandStandardTotal(
        brandId,
        input.account.platform,
        brandStandard,
        input.account.brandName,
      );
    }
  }

  const metrics: RefreshAccountMetricsResult = await refreshAccountMetrics({
    account: input.account,
    dbAccountId: input.dbAccountId,
    brandStandard,
    assumeSessionValid: input.assumeSessionValid,
    quickDeviceCount: input.quickDeviceCount,
  });

  let result = metrics.result;

  if (!metrics.device.valid && isDeviceSessionDeadMessage(metrics.device.message)) {
    const deviceMsg = metrics.device.message ?? 'device_not_connected';
    await markPlatformSessionInvalid(input.dbAccountId, deviceMsg, input.account.platform);
    await recordSessionActivityStatus({
      accountId: input.dbAccountId,
      platform: input.account.platform,
      sessionStatus: 'logout',
      message: deviceMsg,
    });
    result = await invalidSessionMetricsFromDaily({
      accountId: input.dbAccountId,
      brand: input.account.brandName,
      platform: input.account.platform,
      brandStandard,
    });
  }

  const activeRows = await fetchActivePlatformSessions(input.dbAccountId);
  if (result.sessionStatus === 'valid') {
    await recordSessionActivityStatus({
      accountId: input.dbAccountId,
      platform: input.account.platform,
      sessionStatus: 'valid',
      eventType: 'sync_valid',
      message: 'Manual sync: session valid, device groups checked',
      platformSessionId: activeRows[0]?.id ?? null,
    });
  }

  return {
    result,
    masterJoined: metrics.master.joinedInMaster,
    brandStandard,
    deviceGroupCount: metrics.device.valid ? metrics.device.totalGroups : 0,
    hasDailyToday: metrics.hasDailyToday,
    syncMessage: formatSyncMetricsMessage({
      device: result.groupsCurrent,
      brand: result.groupsTotal,
      master: metrics.master.joinedInMaster,
      admin: result.adminCurrent,
    }),
  };
}
