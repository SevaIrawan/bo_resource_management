import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { loadTelegramPlatformSession } from '@/lib/platformSessions';
import type { Platform } from '@/types/database';

export interface SessionProbeResult {
  valid: boolean;
  message?: string;
}

export async function probePlatformSession(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
  /** Scrape / tampilan LIVE — tidak terima “disk ada” sebagai valid. */
  strict?: boolean;
}): Promise<SessionProbeResult> {
  const api = window.electronAPI?.scraper?.validateSession;
  if (!api) {
    return { valid: false, message: 'SCRAPER_DESKTOP_REQUIRED' };
  }

  try {
    const storedSessionString =
      input.platform === 'telegram'
        ? await loadTelegramPlatformSession(input.accountId)
        : null;

    const sessionId = await resolveDeviceSessionId(input);

    return await api({
      sessionId,
      platform: input.platform,
      storedSessionString,
      strict: input.strict,
    });
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : 'Session probe failed',
    };
  }
}
