import { ensurePlatformSessionInDatabase } from '@/lib/ensureWaSessionInDb';
import { persistLoginSessionAfterSuccess } from '@/lib/persistLoginSession';
import {
  hasActivePlatformSession,
  loadTelegramPlatformSession,
  resolveLatestSessionUiStatus,
} from '@/lib/platformSessions';
import { tryWarmPlatformSession } from '@/lib/warmPlatformSession';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

/** Session aktif di `platform_sessions` (bukan `messaging_accounts.is_active`). */
export async function hasStoredPlatformSession(
  accountId: string,
  platform: Platform,
): Promise<boolean> {
  if (await hasActivePlatformSession(accountId)) return true;
  if (platform === 'telegram') {
    const stored = await loadTelegramPlatformSession(accountId);
    return Boolean(stored?.trim());
  }
  return false;
}

/**
 * Boleh lanjut Sync/Scraper tanpa QR — cek session baris akun ini saja (bukan label global).
 */
export async function hasUsableLoginSession(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
  accountName?: string;
}): Promise<boolean> {
  void input.accountName;
  if ((await resolveLatestSessionUiStatus(input.accountId)) === 'valid') {
    return true;
  }

  if (await hasStoredPlatformSession(input.accountId, input.platform)) {
    return true;
  }

  if (input.platform === 'whatsapp' && window.electronAPI?.isElectron) {
    const linked = await ensurePlatformSessionInDatabase({
      dbAccountId: input.accountId,
      uiSessionId: input.sessionId,
      platform: input.platform,
    });
    if (linked) return true;
  }

  return false;
}

export async function backfillPlatformSessionIfNeeded(input: {
  userId: string;
  account: AccountBrandRow;
  dbAccountId: string;
}): Promise<void> {
  if (await hasActivePlatformSession(input.dbAccountId)) return;

  const warmed = await tryWarmPlatformSession({
    sessionId: input.account.id,
    platform: input.account.platform,
    accountId: input.dbAccountId,
  });
  if (!warmed) return;

  try {
    await persistLoginSessionAfterSuccess({
      userId: input.userId,
      account: input.account,
    });
  } catch (err) {
    // Soft: Errno 22 / export gagal sementara — jangan blokir Scrape Now.
    // Session masih di sidecar memory; scrape bisa lanjut + persist setelah write.
    console.warn(
      '[backfillPlatformSession] persist after warm failed (continuing scrape):',
      err instanceof Error ? err.message : String(err),
    );
  }
}
