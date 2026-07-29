import { app, dialog, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

/** Cek update berkala (jam). */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 12_000;

const GITHUB_OWNER = 'SevaIrawan';
const GITHUB_REPO = 'bo_resource_management';

/** Metadata rilis salah → unduhan 404 di Win/Mac/Linux (spasi vs titik, atau artefak OS lain). */
function releaseMetadataBroken(urls: string): string | null {
  if (!urls.trim()) return null;
  if (/\s/.test(urls)) {
    return 'Metadata rilis salah (nama file ada spasi). IT: jalankan Fix release yml, atau install manual dari GitHub Releases.';
  }
  if (process.platform === 'darwin' && /\.exe/i.test(urls)) {
    return 'Update Mac salah arah (metadata rilis). Install .dmg dari Releases atau IT: Fix release yml.';
  }
  if (process.platform === 'win32' && /\.(dmg|AppImage|zip)/i.test(urls)) {
    return 'Update Windows salah arah (metadata rilis). Install .exe dari Releases atau IT: Fix release yml.';
  }
  if (process.platform === 'linux' && /\.(exe|dmg)/i.test(urls)) {
    return 'Update Linux salah arah (metadata rilis). Install .AppImage dari Releases atau IT: Fix release yml.';
  }
  return null;
}

export type AppUpdateUiStatus =
  | 'idle'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface AppUpdateStatusPayload {
  status: AppUpdateUiStatus;
  version?: string;
  /** 0–100 saat status downloading */
  percent?: number;
  errorMessage?: string;
}

let checkTimer: ReturnType<typeof setInterval> | null = null;
let getMainWindow: (() => BrowserWindow | null) | null = null;
let updateStatus: AppUpdateStatusPayload = { status: 'idle' };

function broadcastUpdateStatus(payload: AppUpdateStatusPayload) {
  updateStatus = payload;
  const win = getMainWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('app:update-status', {
      ...payload,
      currentVersion: app.getVersion(),
    });
  }
}

function showRestartDialog(version: string) {
  const win = getMainWindow?.();
  const options = {
    type: 'info' as const,
    title: 'Update ready to install',
    message: `Version ${version} has been downloaded.`,
    detail:
      'Click "Restart now" to finish installing this update on your computer.\n\n' +
      'What stays safe: your .env settings and WhatsApp/Telegram login sessions on this PC are not removed.',
    buttons: ['Restart now', 'Later'],
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
      const message = err instanceof Error ? err.message : String(err);
      console.error('[auto-update] check failed:', message);
      broadcastUpdateStatus({ status: 'error', errorMessage: message });
    });
  };

  setTimeout(runCheck, FIRST_CHECK_DELAY_MS);
  checkTimer = setInterval(runCheck, CHECK_INTERVAL_MS);
}

/** Auto-update dari GitHub Releases — hanya app terinstall, bukan npm run dev. */
export function setupAutoUpdate(resolveWindow: () => BrowserWindow | null) {
  if (!app.isPackaged) return;

  getMainWindow = resolveWindow;

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
  });

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  /** Hindari unduhan diferensial macet (loncatan versi besar, blockmap lama). */
  autoUpdater.disableDifferentialDownload = true;

  autoUpdater.on('checking-for-update', () => {
    console.info('[auto-update] checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    const files = (info as { files?: Array<{ url?: string; size?: number }> }).files ?? [];
    const urls = files.map((f) => f.url ?? '').join(' ');
    const brokenMeta = releaseMetadataBroken(urls);
    if (brokenMeta) {
      console.error('[auto-update]', brokenMeta, urls);
      broadcastUpdateStatus({ status: 'error', version: info.version, errorMessage: brokenMeta });
      return;
    }
    const primary = files[0];
    if (primary && (!primary.size || primary.size <= 0)) {
      const msg =
        'Metadata rilis v' +
        info.version +
        ' rusak (size kosong). Install manual dari GitHub Releases atau tunggu IT perbaiki latest.yml.';
      console.error('[auto-update]', msg, urls);
      broadcastUpdateStatus({ status: 'error', version: info.version, errorMessage: msg });
      return;
    }
    console.info('[auto-update] update available:', info.version, urls);
    updateStatus = { status: 'available', version: info.version };
    broadcastUpdateStatus(updateStatus);
  });

  autoUpdater.on('update-not-available', () => {
    console.info('[auto-update] app is up to date');
    broadcastUpdateStatus({ status: 'idle' });
  });

  autoUpdater.on('error', (err) => {
    const message = err.message || 'Update gagal';
    console.error('[auto-update]', message);
    const checksumFailed =
      /sha512|checksum|integrity|ENOENT|404|403/i.test(message) ||
      message.includes('size');
    const errorMessage = checksumFailed
      ? `${message} — Install manual: GitHub Releases → Resource.Management.Setup.${updateStatus.version ?? 'latest'}.exe`
      : message;
    broadcastUpdateStatus({
      status: 'error',
      version: updateStatus.version,
      errorMessage,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    if (pct % 10 === 0 || pct >= 95) {
      console.info(`[auto-update] downloading ${pct}%`);
    }
    broadcastUpdateStatus({
      status: 'downloading',
      version: updateStatus.version,
      percent: pct,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.info('[auto-update] downloaded:', info.version);
    broadcastUpdateStatus({ status: 'downloaded', version: info.version });
    showRestartDialog(info.version);
  });

  schedulePeriodicChecks();
}

export function getAppUpdateStatus(): AppUpdateStatusPayload & { currentVersion: string } {
  return {
    ...updateStatus,
    currentVersion: app.getVersion(),
  };
}

/** Pasang update yang sudah diunduh (dipanggil dari UI Update Now). */
export function installDownloadedUpdate(): { ok: boolean; message?: string } {
  if (!app.isPackaged) {
    return { ok: false, message: 'Auto-update hanya jalan di app terinstall (bukan dev).' };
  }
  if (updateStatus.status !== 'downloaded') {
    return {
      ok: false,
      message:
        updateStatus.status === 'available' ||
        updateStatus.status === 'downloading'
          ? 'Update masih diunduh. Tunggu sebentar lalu pilih Update Now lagi.'
          : updateStatus.status === 'error'
            ? updateStatus.errorMessage ?? 'Unduhan update gagal. Install manual dari IT.'
            : 'Tidak ada update yang siap dipasang.',
    };
  }
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
}

export async function checkForUpdatesNow(): Promise<{
  status: 'dev' | 'checking' | 'error';
  message?: string;
}> {
  const currentVersion = app.getVersion();
  if (!app.isPackaged) {
    return {
      status: 'dev',
      message: `Auto-update hanya jalan di app terinstall. Versi saat ini: v${currentVersion}.`,
    };
  }

  try {
    await autoUpdater.checkForUpdates();
    const latest = updateStatus.version;
    if (updateStatus.status === 'error') {
      return {
        status: 'error',
        message: updateStatus.errorMessage ?? 'Update check failed',
      };
    }
    const extra =
      updateStatus.status === 'available' ||
      updateStatus.status === 'downloading' ||
      updateStatus.status === 'downloaded'
        ? ` Pembaruan v${latest ?? '?'} tersedia.`
        : ' App sudah versi terbaru.';
    return {
      status: 'checking',
      message: `Versi saat ini v${currentVersion}.${extra}`,
    };
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
