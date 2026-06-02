import { app, dialog, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

/** Cek update berkala (jam). */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 12_000;

export type AppUpdateUiStatus = 'idle' | 'available' | 'downloaded';

export interface AppUpdateStatusPayload {
  status: AppUpdateUiStatus;
  version?: string;
}

let checkTimer: ReturnType<typeof setInterval> | null = null;
let getMainWindow: (() => BrowserWindow | null) | null = null;
let updateStatus: AppUpdateStatusPayload = { status: 'idle' };

function broadcastUpdateStatus(payload: AppUpdateStatusPayload) {
  updateStatus = payload;
  const win = getMainWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('app:update-status', payload);
  }
}

function showRestartDialog(version: string) {
  const win = getMainWindow?.();
  const options = {
    type: 'info' as const,
    title: 'Pembaruan tersedia',
    message: `Versi ${version} sudah diunduh.`,
    detail:
      'Klik Restart untuk pasang update. File .env dan sesi WhatsApp/Telegram di PC ini tetap aman.',
    buttons: ['Restart sekarang', 'Nanti'],
    defaultId: 0,
    cancelId: 1,
  };

  const promise =
    win && !win.isDestroyed()
      ? dialog.showMessageBox(win, options)
      : dialog.showMessageBox(options);

  void promise.then(({ response }) => {
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
}

function schedulePeriodicChecks() {
  const runCheck = () => {
    void autoUpdater.checkForUpdates().catch((err) => {
      console.error('[auto-update] check failed:', err instanceof Error ? err.message : err);
    });
  };

  setTimeout(runCheck, FIRST_CHECK_DELAY_MS);
  checkTimer = setInterval(runCheck, CHECK_INTERVAL_MS);
}

/** Auto-update dari GitHub Releases — hanya app terinstall (.exe), bukan npm run dev. */
export function setupAutoUpdate(resolveWindow: () => BrowserWindow | null) {
  if (!app.isPackaged) return;

  getMainWindow = resolveWindow;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.info('[auto-update] checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.info('[auto-update] update available:', info.version);
    broadcastUpdateStatus({ status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    console.info('[auto-update] app is up to date');
    broadcastUpdateStatus({ status: 'idle' });
  });

  autoUpdater.on('error', (err) => {
    console.error('[auto-update]', err.message);
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    if (pct % 20 === 0 || pct >= 95) {
      console.info(`[auto-update] downloading ${pct}%`);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.info('[auto-update] downloaded:', info.version);
    broadcastUpdateStatus({ status: 'downloaded', version: info.version });
    showRestartDialog(info.version);
  });

  schedulePeriodicChecks();
}

export function getAppUpdateStatus(): AppUpdateStatusPayload {
  return updateStatus;
}

export async function checkForUpdatesNow(): Promise<{
  status: 'dev' | 'checking' | 'error';
  message?: string;
}> {
  if (!app.isPackaged) {
    return { status: 'dev', message: 'Auto-update hanya jalan di app terinstall (bukan dev).' };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { status: 'checking', message: 'Memeriksa GitHub Releases...' };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Update check failed',
    };
  }
}

export function disposeAutoUpdate() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
  getMainWindow = null;
  updateStatus = { status: 'idle' };
}
