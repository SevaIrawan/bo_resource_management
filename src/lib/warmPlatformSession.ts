import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import {
  hasActivePlatformSession,
  loadTelegramPlatformSession,
} from '@/lib/platformSessions';
import type { Platform } from '@/types/database';

export async function tryWarmPlatformSession(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
}): Promise<boolean> {
  const tryRestore = window.electronAPI?.platformLogin?.tryRestore;
  if (!tryRestore) return false;

  const storedSessionString =
    input.platform === 'telegram'
      ? await loadTelegramPlatformSession(input.accountId)
      : null;

  const deviceSessionId = await resolveDeviceSessionId(input);

  const result = await tryRestore({
    sessionId: deviceSessionId,
    platform: input.platform,
    storedSessionString,
  });

  return Boolean(result?.ready);
}

/** Pulihkan client dari DB/disk tanpa hapus auth dan tanpa QR. */
export async function warmSessionIfStored(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
  userId?: string | null;
}): Promise<boolean> {
  const hasDb = await hasActivePlatformSession(input.accountId);
  if (!hasDb && input.platform === 'telegram') {
    const stored = await loadTelegramPlatformSession(input.accountId);
    if (!stored?.trim()) return false;
  }

  return tryWarmPlatformSession(input);
}
