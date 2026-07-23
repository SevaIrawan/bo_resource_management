import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { invalidSessionMetricsFromDaily } from '@/lib/accountSessionUi';
import { prepareDeviceForPlatformLogin } from '@/lib/prepareDeviceForLogin';
import { invalidatePlatformSessionEverywhere } from '@/lib/platformSessionSync';
import { logSessionLogoutActivity } from '@/lib/platformSessionLogs';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

export const CLEAR_SESSION_REASON = 'user_cleared';

async function cancelActiveDeviceWork(input: {
  account: AccountBrandRow;
  dbAccountId: string;
}): Promise<void> {
  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: input.account.id,
    platform: input.account.platform,
    accountId: input.dbAccountId,
  });

  await window.electronAPI?.scraper
    ?.cancel?.({
      sessionId: deviceSessionId,
      platform: input.account.platform,
    })
    .catch(() => undefined);

  await window.electronAPI?.scraper
    ?.cancelAuto?.({
      sessionId: deviceSessionId,
      platform: input.account.platform,
    })
    .catch(() => undefined);
}

/**
 * Clear Session — putus rantai device + invalidate DB.
 * WA: purge folder LocalAuth + DB invalid (auth hanya di PC ini).
 * TG: stop sidecar + DB invalid (session string Supabase; tidak ada folder lokal).
 * Setelah ini, Sync/Run masuk jalur `open_login` (modal QR bersih, bukan stuck restore).
 */
export async function clearAccountSession(input: {
  userId: string;
  account: AccountBrandRow;
  dbAccountId?: string;
}): Promise<{ dbAccountId: string; result: AccountSyncResult }> {
  if (!window.electronAPI?.isElectron) {
    throw new Error('SCRAPER_DESKTOP_REQUIRED');
  }

  const dbAccountId =
    input.dbAccountId ??
    (
      await resolveDbAccountForRow({
        userId: input.userId,
        account: input.account,
      })
    ).accountId;

  await cancelActiveDeviceWork({ account: input.account, dbAccountId });

  await prepareDeviceForPlatformLogin({
    account: input.account,
    dbAccountId,
    reloginCode: 'SESSION_INVALID_FORCE_SCRAPER',
  });

  await invalidatePlatformSessionEverywhere(
    dbAccountId,
    CLEAR_SESSION_REASON,
    input.account.platform,
    { purgeWaDisk: input.account.platform === 'whatsapp' },
  );

  await logSessionLogoutActivity({
    accountId: dbAccountId,
    platform: input.account.platform,
    reason: CLEAR_SESSION_REASON,
  });

  const result = await invalidSessionMetricsFromDaily({
    accountId: dbAccountId,
    brand: input.account.brandName,
    platform: input.account.platform,
    brandStandard: input.account.groupsTotal,
  });

  return { dbAccountId, result };
}
