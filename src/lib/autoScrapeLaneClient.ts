import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

/** Cek main process: user lane sibuk untuk akun ini → auto scrape skip. */
export async function isAutoScrapeLaneReadyForAccount(
  account: AccountBrandRow,
  dbAccountId?: string,
): Promise<boolean> {
  const api = window.electronAPI?.scraper?.autoLaneReady;
  if (!api) return true;

  const accountId = dbAccountId?.trim() || account.id;
  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: account.id,
    platform: account.platform,
    accountId,
  });

  const result = await api({ sessionId: deviceSessionId, accountId });
  return result.ready === true;
}
