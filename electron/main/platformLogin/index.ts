import { ipcMain, type BrowserWindow } from 'electron';
import {
  startTelegramQrLogin,
  startTelegramPhoneLogin,
  submitTelegramCode,
  submitTelegram2fa,
  stopTelegramLogin,
  shutdownSidecar,
} from './telegramSidecar';
import { tryRestorePlatformSession } from './restore';
import { assertAccountExecuteAllowed } from '../automation/jobQueueGuard';
import { getJobQueueSnapshot } from '../automation/jobQueueStore';
import {
  clearWhatsAppLocalAuth,
  forceReleaseWhatsAppForLogin,
  hasWhatsAppDiskAuth,
  startWhatsAppQrLogin,
  startWhatsAppPhoneLogin,
  stopWhatsAppLogin,
} from './whatsapp';

type Platform = 'whatsapp' | 'telegram';
type LoginMode = 'qr' | 'phone';

interface StartPayload {
  sessionId: string;
  platform: Platform;
  /** UUID baris `messaging_accounts` — guard job queue per akun. */
  accountId?: string;
  mode?: LoginMode;
  phone?: string;
  /** true = paksa QR baru (logout di HP), jangan restore disk/string DB */
  skipDiskRestore?: boolean;
  /** Perkiraan jumlah grup — skala timeout bootstrap/scan QR (hingga ~3000). */
  groupEstimate?: number;
  /** Sudah lewat prepareDeviceForPlatformLogin — hindari release/settle ganda. */
  alreadyPrepared?: boolean;
}

interface SubmitPayload {
  sessionId: string;
  platform: Platform;
  kind: 'code' | '2fa' | 'phone';
  value: string;
}

let mainWindow: BrowserWindow | null = null;

function getWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window is not available');
  }
  return mainWindow;
}

export function setPlatformLoginWindow(win: BrowserWindow) {
  mainWindow = win;
}

export function registerPlatformLoginIpc() {
  ipcMain.handle('platform-login:start', async (_event, payload: StartPayload) => {
    const win = getWindow();
    const mode = payload.mode ?? 'qr';
    const accountId = payload.accountId ?? payload.sessionId;

    try {
      const jobs = getJobQueueSnapshot().jobs;
      assertAccountExecuteAllowed(payload.sessionId, accountId, jobs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'EXECUTE_BLOCKED';
      throw new Error(message);
    }

    if (payload.platform === 'whatsapp') {
      if (mode === 'phone') {
        if (!payload.phone?.trim()) {
          throw new Error('Phone number is required');
        }
        await startWhatsAppPhoneLogin(payload.sessionId, payload.phone.trim(), win);
      } else {
        await startWhatsAppQrLogin(payload.sessionId, win, {
          skipDiskRestore: Boolean(payload.skipDiskRestore),
          groupEstimate: payload.groupEstimate ?? 0,
          alreadyPrepared: Boolean(payload.alreadyPrepared),
        });
      }
      return { ok: true };
    }

    if (mode === 'phone') {
      if (!payload.phone?.trim()) {
        throw new Error('Phone number is required');
      }
      await startTelegramPhoneLogin(payload.sessionId, payload.phone.trim(), win);
    } else {
      await startTelegramQrLogin(payload.sessionId, win);
    }

    return { ok: true };
  });

  ipcMain.handle('platform-login:submit', async (_event, payload: SubmitPayload) => {
    const win = getWindow();

    if (payload.platform === 'whatsapp' && payload.kind === 'phone') {
      await startWhatsAppPhoneLogin(payload.sessionId, payload.value.trim(), win);
      return { ok: true };
    }

    if (payload.platform === 'telegram') {
      if (payload.kind === 'phone') {
        await startTelegramPhoneLogin(payload.sessionId, payload.value.trim(), win);
      } else if (payload.kind === 'code') {
        await submitTelegramCode(payload.sessionId, payload.value.trim(), win);
      } else if (payload.kind === '2fa') {
        await submitTelegram2fa(payload.sessionId, payload.value, win);
      }
    }

    return { ok: true };
  });

  ipcMain.handle(
    'platform-login:cancel',
    async (_event, sessionId: string, platform?: Platform) => {
      if (!platform || platform === 'whatsapp') {
        await stopWhatsAppLogin(sessionId);
      }
      if (!platform || platform === 'telegram') {
        await stopTelegramLogin(sessionId);
      }
      return { ok: true };
    },
  );

  ipcMain.handle(
    'platform-login:release',
    async (
      _event,
      sessionId: string,
      options?: {
        purgeWaDisk?: boolean;
        groupEstimate?: number;
        fast?: boolean;
        urgent?: boolean;
      },
    ) => {
      await forceReleaseWhatsAppForLogin(sessionId, {
        purgeDisk: Boolean(options?.purgeWaDisk),
        groupEstimate: options?.groupEstimate ?? 0,
        fast: options?.fast,
        urgent: options?.urgent,
      });
      await stopTelegramLogin(sessionId);
      return { ok: true };
    },
  );

  ipcMain.handle('platform-login:purge-wa-auth', async (_event, sessionId: string) => {
    clearWhatsAppLocalAuth(sessionId);
    return { ok: true };
  });

  ipcMain.handle('platform-login:has-wa-disk-auth', async (_event, sessionId: string) => {
    return { hasAuth: hasWhatsAppDiskAuth(sessionId) };
  });

  ipcMain.handle(
    'platform-login:try-restore',
    async (
      _event,
      payload: {
        sessionId: string;
        platform: Platform;
        accountId?: string;
        storedSessionString?: string | null;
      },
    ) => {
      try {
        const jobs = getJobQueueSnapshot().jobs;
        const accountId = payload.accountId ?? payload.sessionId;
        assertAccountExecuteAllowed(
          payload.sessionId,
          accountId,
          jobs,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'EXECUTE_BLOCKED';
        return { ready: false, message };
      }
      const win = getWindow();
      return tryRestorePlatformSession(win, payload);
    },
  );
}

export function cleanupPlatformLogin() {
  shutdownSidecar();
}
