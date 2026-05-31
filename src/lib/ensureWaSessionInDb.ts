import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import {
  hasActivePlatformSession,
  saveWhatsAppPlatformSession,
} from '@/lib/platformSessions';
import type { Platform } from '@/types/database';

/**
 * NABIL: disk session-c8421341… ada, platform_sessions kosong → sync selalu QR.
 * Tulis baris DB dari LocalAuth id yang dipakai Electron.
 */
export async function ensureWaSessionInDatabase(input: {
  dbAccountId: string;
  uiSessionId: string;
}): Promise<boolean> {
  if (await hasActivePlatformSession(input.dbAccountId)) {
    return true;
  }

  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: input.uiSessionId,
    platform: 'whatsapp',
    accountId: input.dbAccountId,
  });

  const hasDisk = await window.electronAPI?.platformLogin?.hasWaDiskAuth?.(deviceSessionId);
  if (!hasDisk?.hasAuth) {
    return false;
  }

  await saveWhatsAppPlatformSession({
    accountId: input.dbAccountId,
    localAuthClientId: deviceSessionId,
    loginMethod: 'qr',
  });

  return hasActivePlatformSession(input.dbAccountId);
}

export async function ensurePlatformSessionInDatabase(input: {
  dbAccountId: string;
  uiSessionId: string;
  platform: Platform;
}): Promise<boolean> {
  if (input.platform !== 'whatsapp') {
    return hasActivePlatformSession(input.dbAccountId);
  }
  return ensureWaSessionInDatabase({
    dbAccountId: input.dbAccountId,
    uiSessionId: input.uiSessionId,
  });
}
