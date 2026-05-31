import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { loadTelegramPlatformSession } from '@/lib/platformSessions';
import type { Platform } from '@/types/database';

export interface LiveSessionCheckInput {
  sessionId: string;
  platform: Platform;
  accountId: string;
}

/**
 * Session hidup di device (CONNECTED / Telethon authorized).
 * Bukan cukup baris DB atau folder disk — wajib sebelum scrape.
 */
export async function requireLiveDeviceSession(
  input: LiveSessionCheckInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const api = window.electronAPI?.scraper?.validateSession;
  if (!api) {
    return { ok: false, message: 'SCRAPER_DESKTOP_REQUIRED' };
  }

  const storedSessionString =
    input.platform === 'telegram'
      ? await loadTelegramPlatformSession(input.accountId)
      : null;

  const deviceSessionId = await resolveDeviceSessionId(input);

  const result = await api({
    sessionId: deviceSessionId,
    platform: input.platform,
    storedSessionString,
    strict: true,
  });

  if (!result.valid) {
    const msg = result.message ?? 'Session not connected on device. Log in again.';
    return { ok: false, message: msg };
  }

  return { ok: true };
}
