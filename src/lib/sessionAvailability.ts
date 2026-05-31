import { findMessagingAccountWithActiveSession } from '@/lib/accountSessionResolve';
import { ensurePlatformSessionInDatabase } from '@/lib/ensureWaSessionInDb';
import { persistLoginSessionAfterSuccess } from '@/lib/persistLoginSession';
import {
  hasActivePlatformSession,
  loadTelegramPlatformSession,
} from '@/lib/platformSessions';
import { tryWarmPlatformSession } from '@/lib/warmPlatformSession';
import { withTimeout } from '@/lib/withTimeout';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

const DISK_RESTORE_CHECK_MS = 35_000;

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
 * Boleh lanjut Sync/Scraper tanpa QR.
 * DB aktif = cukup (device warm opsional, jangan paksa scan).
 */
export async function hasUsableLoginSession(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
  accountName?: string;
}): Promise<boolean> {
  if (input.accountName?.trim()) {
    const byLabel = await findMessagingAccountWithActiveSession(
      input.accountName,
      input.platform,
    );
    if (byLabel) return true;
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

  if (!window.electronAPI?.platformLogin?.tryRestore) {
    return false;
  }

  try {
    return await withTimeout(
      tryWarmPlatformSession(input),
      DISK_RESTORE_CHECK_MS,
      'Restore device session',
    );
  } catch {
    return false;
  }
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

  await persistLoginSessionAfterSuccess({
    userId: input.userId,
    account: input.account,
  });
}
