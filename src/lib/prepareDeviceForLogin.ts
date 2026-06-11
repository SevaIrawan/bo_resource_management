import { accountGroupEstimate } from '@/config/syncScraperPolicy';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

const LOGIN_PREP_SETTLE_MS = 200;

export type LoginPurgeWaDiskHint = 'none' | 'device_dead';

/** Purge LocalAuth hanya saat session benar-benar mati di device — bukan setiap buka modal. */
export function shouldPurgeWaDiskForLogin(input: {
  platform: Platform;
  reloginCode?: string;
  purgeHint?: LoginPurgeWaDiskHint;
}): boolean {
  if (input.platform !== 'whatsapp') return false;
  if (input.purgeHint === 'device_dead') return true;
  if (input.reloginCode === 'SESSION_INVALID_FORCE_SCRAPER') return true;
  return false;
}

/** Batalkan login sidecar/Puppeteer — pakai device session id (TG: UUID akun; WA: LocalAuth id). */
export async function cancelPlatformLoginForAccount(input: {
  account: AccountBrandRow;
  dbAccountId?: string;
}): Promise<void> {
  const api = window.electronAPI?.platformLogin;
  if (!api) return;

  const accountId = input.dbAccountId ?? input.account.id;
  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: input.account.id,
    platform: input.account.platform,
    accountId,
  });

  await api.cancel(deviceSessionId, input.account.platform).catch(() => undefined);
}

/**
 * Lepas client probe/sync/scrape sebelum modal login — satu release cepat (urgent),
 * hindari overlap Puppeteer dan release ganda saat QR start.
 */
export async function prepareDeviceForPlatformLogin(input: {
  account: AccountBrandRow;
  dbAccountId?: string;
  purgeWaDisk?: boolean;
  reloginCode?: string;
  purgeHint?: LoginPurgeWaDiskHint;
}): Promise<void> {
  const api = window.electronAPI?.platformLogin;
  if (!api) return;

  const accountId = input.dbAccountId ?? input.account.id;
  const groupEstimate = accountGroupEstimate(input.account);
  const purgeWaDisk =
    input.purgeWaDisk ??
    shouldPurgeWaDiskForLogin({
      platform: input.account.platform,
      reloginCode: input.reloginCode,
      purgeHint: input.purgeHint,
    });

  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: input.account.id,
    platform: input.account.platform,
    accountId,
  });

  await cancelPlatformLoginForAccount({
    account: input.account,
    dbAccountId: accountId,
  });
  await api
    .release(deviceSessionId, {
      purgeWaDisk: purgeWaDisk,
      groupEstimate,
      fast: true,
      urgent: true,
    })
    .catch(() => undefined);

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, LOGIN_PREP_SETTLE_MS);
  });
}
