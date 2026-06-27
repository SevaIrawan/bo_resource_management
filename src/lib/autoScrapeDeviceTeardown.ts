import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

const teardownInFlight = new Set<string>();

/** Tutup auto scrape lane + lepas Chrome — tidak sentuh execute slot user. */
export async function teardownAutoScrapeDevice(input: {
  account: AccountBrandRow;
  dbAccountId?: string;
}): Promise<void> {
  const key = input.dbAccountId?.trim() || input.account.id;
  if (teardownInFlight.has(key)) return;
  teardownInFlight.add(key);

  const api = window.electronAPI?.scraper?.cancelAuto;
  if (!api) {
    teardownInFlight.delete(key);
    return;
  }

  try {
    const deviceSessionId = await resolveDeviceSessionId({
      sessionId: input.account.id,
      platform: input.account.platform,
      accountId: input.dbAccountId?.trim() || input.account.id,
    });
    await api({
      sessionId: deviceSessionId,
      platform: input.account.platform,
    });
  } catch {
    /* force-stop best effort */
  } finally {
    teardownInFlight.delete(key);
  }
}
