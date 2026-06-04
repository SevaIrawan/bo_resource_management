import type { Platform } from '@/types/database';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { loadTelegramPlatformSession } from '@/lib/platformSessions';

export interface DeviceGroupCountResult {
  valid: boolean;
  totalGroups: number;
  adminGroups: number;
  /** Daftar group_id di device — dipakai sync daily agar issue ticket realtime. */
  groupIds?: string[];
  message?: string;
}

export async function countDeviceGroups(
  input: {
    sessionId: string;
    platform: Platform;
    accountId: string;
  },
  options?: { quick?: boolean },
): Promise<DeviceGroupCountResult> {
  const api = window.electronAPI?.scraper?.countGroups;
  if (!api) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: 'SCRAPER_DESKTOP_REQUIRED',
    };
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
      quick: options?.quick,
    });
  } catch (error) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: error instanceof Error ? error.message : 'Count groups failed',
    };
  }
}
