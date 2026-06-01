import type { BrowserWindow } from 'electron';
import { restoreTelegramSession } from '../scraper/telegramScrape';
import { validateTelegramSession } from '../scraper/validateSession';
import {
  hasWhatsAppDiskAuth,
  restoreWhatsAppFromDiskForLogin,
} from './whatsapp';

type Platform = 'whatsapp' | 'telegram';

export async function tryRestorePlatformSession(
  win: BrowserWindow,
  payload: {
    sessionId: string;
    platform: Platform;
    storedSessionString?: string | null;
  },
): Promise<{ ready: boolean; message?: string }> {
  if (payload.platform === 'whatsapp') {
    try {
      if (hasWhatsAppDiskAuth(payload.sessionId)) {
        const restored = await restoreWhatsAppFromDiskForLogin(payload.sessionId, win);
        if (restored) {
          return { ready: true };
        }
      }

      return { ready: false, message: 'WhatsApp not connected. Scan QR to link.' };
    } catch (error) {
      return {
        ready: false,
        message: error instanceof Error ? error.message : 'WhatsApp restore failed',
      };
    }
  }

  if (payload.platform === 'telegram') {
    const stored = payload.storedSessionString?.trim();
    if (stored) {
      try {
        await restoreTelegramSession(payload.sessionId, stored);
      } catch (error) {
        return {
          ready: false,
          message: error instanceof Error ? error.message : 'Telegram restore failed',
        };
      }
    }

    const validated = await validateTelegramSession(payload.sessionId, stored ?? null);
    if (validated.valid) {
      if (!win.isDestroyed()) {
        win.webContents.send('platform-login:ready', {
          sessionId: payload.sessionId,
          platform: 'telegram',
        });
      }
      return { ready: true };
    }

    return {
      ready: false,
      message: validated.message ?? 'Telegram session not available',
    };
  }

  return { ready: false, message: 'Unknown platform' };
}
