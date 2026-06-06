import fs from 'fs';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import QRCode from 'qrcode';
import pkg from 'whatsapp-web.js';
import { waitForWhatsAppStoreReady } from '../scraper/whatsappGroupDiscovery';
import {
  delayMs,
  HUMAN_SETTLE_LONG_MS,
  HUMAN_SETTLE_MEDIUM_MS,
  HUMAN_SETTLE_SHORT_MS,
  isRetryableNetworkError,
  NETWORK_RETRY_ATTEMPTS,
  withNetworkRetry,
} from '../lib/networkRetry';
import { withWaBrowserSlot } from './waBrowserPool';
import { waClientPuppeteerOptions } from './waPuppeteerChrome';
import {
  waDiskRestoreTimeoutMs,
  waQrBootstrapDeadlineMs,
  waQrScanWaitMs,
} from '../scraper/deviceGroupScale';

const { Client, LocalAuth } = pkg;

type WaMode = 'qr' | 'phone';

interface WaSession {
  client: InstanceType<typeof Client>;
  mode: WaMode;
  loggedIn?: boolean;
  /** false saat restore disk — QR tidak boleh ke UI (client bisa langsung di-destroy). */
  forwardQrToUi?: boolean;
  qrGeneration?: number;
}

const sessions = new Map<string, WaSession>();
const sessionLocks = new Map<string, Promise<unknown>>();
/** Lock per sessionId — multi-akun WA boleh paralel (folder LocalAuth terpisah). */
const WA_DESTROY_SETTLE_MS = HUMAN_SETTLE_SHORT_MS;
const WA_LOGIN_PREPARE_SETTLE_MS = HUMAN_SETTLE_LONG_MS;
const WA_LOCK_WAIT_MS = 6_000;

const qrAppearTimers = new Map<string, ReturnType<typeof setTimeout>>();
function waSessionsRoot() {
  return path.join(app.getPath('userData'), 'wa-sessions');
}

/** Fakta di disk: folder LocalAuth ada (login WA pernah sukses di PC ini). */
export function hasWhatsAppDiskAuth(sessionId: string): boolean {
  const sessionDir = path.join(waSessionsRoot(), `session-${sessionId}`);
  if (!fs.existsSync(sessionDir)) return false;
  const markers = [
    path.join(sessionDir, 'Default', 'IndexedDB'),
    path.join(sessionDir, 'Default', 'Local Storage'),
    path.join(sessionDir, '.wwebjs_auth'),
  ];
  return markers.some((p) => fs.existsSync(p));
}

function isBrowserAlreadyRunningError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.toLowerCase().includes('browser is already running');
}

/** Satu operasi WA per sessionId — cegah double Puppeteer pada folder yang sama. */
function withWaSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(sessionId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  sessionLocks.set(sessionId, next);
  void next.finally(() => {
    if (sessionLocks.get(sessionId) === next) {
      sessionLocks.delete(sessionId);
    }
  });
  return next;
}

/** Hapus cache LocalAuth — hanya saat login baru / unlink di HP. */
export function clearWhatsAppLocalAuth(sessionId: string) {
  const root = waSessionsRoot();
  const dirs = [
    path.join(root, `session-${sessionId}`),
    path.join(root, '.wwebjs_auth', `session-${sessionId}`),
    path.join(root, 'session', sessionId),
  ];

  for (const dir of dirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      // puppeteer may still hold locks briefly
    }
  }
}

function normalizeWaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) {
    throw new Error('Invalid phone number');
  }
  return digits;
}

function getNotifierWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows();
  return wins.find((w) => !w.isDestroyed()) ?? null;
}

/** Logout di HP / auth failure → IPC invalid (login + scrape client). */
function attachSessionIntegrityHandlers(
  sessionId: string,
  client: InstanceType<typeof Client>,
) {
  if ((client as unknown as { __rmIntegrity?: boolean }).__rmIntegrity) return;
  (client as unknown as { __rmIntegrity?: boolean }).__rmIntegrity = true;

  client.on('auth_failure', (message) => {
    const win = getNotifierWindow();
    if (!win) return;
    win.webContents.send('platform-session:invalid', {
      sessionId,
      platform: 'whatsapp',
      message: String(message),
    });
  });

  client.on('disconnected', (reason) => {
    const raw = String(reason ?? 'WhatsApp disconnected');
    const message = formatWhatsAppDisconnectMessage(raw);
    const win = getNotifierWindow();
    if (!win) return;
    win.webContents.send('platform-session:invalid', {
      sessionId,
      platform: 'whatsapp',
      message,
    });
  });
}

function attachCommonHandlers(
  sessionId: string,
  client: InstanceType<typeof Client>,
  win: BrowserWindow,
) {
  attachSessionIntegrityHandlers(sessionId, client);
  client.on('qr', (qr) => {
    const session = sessions.get(sessionId);
    if (!session || session.mode !== 'qr' || !session.forwardQrToUi) return;

    const generation = (session.qrGeneration ?? 0) + 1;
    session.qrGeneration = generation;

    void QRCode.toDataURL(qr, { width: 200, margin: 1 }).then((dataUrl) => {
      if (!win.isDestroyed()) {
        win.webContents.send('platform-login:qr', {
          sessionId,
          platform: 'whatsapp',
          dataUrl,
          generation,
        });
      }
    });
  });

  client.on('authenticated', () => {
    const session = sessions.get(sessionId);
    if (!session || session.mode !== 'qr') return;

    if (!win.isDestroyed()) {
      win.webContents.send('platform-login:phase', {
        sessionId,
        platform: 'whatsapp',
        phase: 'confirming',
      });
    }
  });

  client.on('code', (code: string) => {
    const session = sessions.get(sessionId);
    if (!session || session.mode !== 'phone') return;

    if (!win.isDestroyed()) {
      win.webContents.send('platform-login:pairing-code', {
        sessionId,
        platform: 'whatsapp',
        code,
      });
    }
  });

  client.on('ready', () => {
    const session = sessions.get(sessionId);
    if (session) session.loggedIn = true;

    if (!win.isDestroyed()) {
      win.webContents.send('platform-login:ready', {
        sessionId,
        platform: 'whatsapp',
      });
    }
  });

  client.on('auth_failure', (message) => {
    if (!win.isDestroyed()) {
      win.webContents.send('platform-session:invalid', {
        sessionId,
        platform: 'whatsapp',
        message: String(message),
      });
      win.webContents.send('platform-login:error', {
        sessionId,
        platform: 'whatsapp',
        message: String(message),
      });
    }
  });

  client.on('disconnected', (reason) => {
    const raw = String(reason ?? 'WhatsApp disconnected');
    const message = formatWhatsAppDisconnectMessage(raw);
    const session = sessions.get(sessionId);
    const duringLogin = session && !session.loggedIn;

    if (!win.isDestroyed()) {
      if (!duringLogin) {
        win.webContents.send('platform-session:invalid', {
          sessionId,
          platform: 'whatsapp',
          message,
        });
      }
      win.webContents.send('platform-login:error', {
        sessionId,
        platform: 'whatsapp',
        message,
      });
    }
  });
}

function formatWhatsAppDisconnectMessage(reason: string): string {
  const upper = reason.trim().toUpperCase();
  if (upper === 'LOGOUT' || upper.includes('LOG OUT')) {
    return 'WhatsApp was unlinked on your phone. A new QR code will load — scan again or use phone linking.';
  }
  return reason;
}

async function closeWhatsAppPuppeteer(client: InstanceType<typeof Client>): Promise<void> {
  try {
    const pupBrowser = (
      client as unknown as {
        pupBrowser?: Promise<{ isConnected(): boolean; close(): Promise<void> } | null>;
      }
    ).pupBrowser;
    if (pupBrowser) {
      const browser = await pupBrowser.catch(() => null);
      if (browser?.isConnected?.()) {
        await browser.close().catch(() => undefined);
      }
    }
  } catch {
    // ignore — lanjut destroy client
  }

  try {
    await client.destroy();
  } catch {
    // already destroyed
  }
}

function createClient(sessionId: string, mode: WaMode, phone?: string) {
  /** LocalAuth → folder `wa-sessions/session-{sessionId}` per akun (clientId unik). */
  const options: ConstructorParameters<typeof Client>[0] = {
    authStrategy: new LocalAuth({
      clientId: sessionId,
      dataPath: waSessionsRoot(),
    }),
    puppeteer: waClientPuppeteerOptions(),
  };

  if (mode === 'phone' && phone) {
    options.pairWithPhoneNumber = {
      phoneNumber: phone,
      showNotification: false,
    };
  }

  return new Client(options);
}

function waitForClientReady(
  sessionId: string,
  client: InstanceType<typeof Client>,
  mode: WaMode,
  timeoutMs = waQrScanWaitMs(0),
): Promise<InstanceType<typeof Client>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          'WhatsApp session timed out. Use QR or phone linking in Linked Devices.',
        ),
      );
    }, timeoutMs);

    const onReady = () => {
      cleanup();
      const session = sessions.get(sessionId);
      if (session) session.loggedIn = true;
      else sessions.set(sessionId, { client, mode, loggedIn: true });
      resolve(client);
    };

    const onAuthFailure = (message: unknown) => {
      cleanup();
      reject(new Error(String(message)));
    };

    const onDisconnected = (reason: unknown) => {
      cleanup();
      reject(new Error(String(reason ?? 'WhatsApp disconnected')));
    };

    function cleanup() {
      clearTimeout(timeout);
      client.off('ready', onReady);
      client.off('auth_failure', onAuthFailure);
      client.off('disconnected', onDisconnected);
    }

    client.once('ready', onReady);
    client.once('auth_failure', onAuthFailure);
    client.once('disconnected', onDisconnected);
  });
}

function clearQrAppearDeadline(sessionId: string) {
  const timer = qrAppearTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    qrAppearTimers.delete(sessionId);
  }
}

function armQrAppearDeadline(
  sessionId: string,
  client: InstanceType<typeof Client>,
  win: BrowserWindow,
  groupEstimate = 0,
) {
  clearQrAppearDeadline(sessionId);
  const deadlineMs = waQrBootstrapDeadlineMs(groupEstimate);
  const timer = setTimeout(() => {
    qrAppearTimers.delete(sessionId);
    const session = sessions.get(sessionId);
    if (session?.loggedIn || (session?.qrGeneration ?? 0) > 0) return;

    console.warn(
      `[whatsapp] QR not visible yet for ${sessionId} after ${deadlineMs}ms — keeping browser alive`,
    );

    if (!win.isDestroyed()) {
      win.webContents.send('platform-login:error', {
        sessionId,
        platform: 'whatsapp',
        message:
          'QR is still loading. Large accounts may take several minutes — wait or tap Refresh QR.',
      });
    }
  }, deadlineMs);

  qrAppearTimers.set(sessionId, timer);
  client.once('qr', () => clearQrAppearDeadline(sessionId));
  client.once('ready', () => clearQrAppearDeadline(sessionId));
}

async function waitForWaLockOrTimeout(sessionId: string): Promise<void> {
  const prev = sessionLocks.get(sessionId);
  if (!prev) return;
  await Promise.race([prev.catch(() => undefined), delayMs(WA_LOCK_WAIT_MS)]);
}

/** Lepas client scrape/probe + lock supaya login QR tidak macet "browser already running". */
export async function forceReleaseWhatsAppForLogin(
  sessionId: string,
  options?: { purgeDisk?: boolean },
): Promise<void> {
  clearQrAppearDeadline(sessionId);

  /** Tunggu operasi lain pada akun yang sama selesai — jangan cabut lock (bisa double Chrome). */
  await waitForWaLockOrTimeout(sessionId);

  const session = sessions.get(sessionId);
  if (session) {
    sessions.delete(sessionId);
    await closeWhatsAppPuppeteer(session.client);
    await delayMs(WA_DESTROY_SETTLE_MS);
  }

  if (options?.purgeDisk) {
    clearWhatsAppLocalAuth(sessionId);
  }
  await delayMs(WA_LOGIN_PREPARE_SETTLE_MS);
}

async function initializeClientWithRetry(
  sessionId: string,
  client: InstanceType<typeof Client>,
  /** Dari modal login — wajib pakai window utama, jangan lookup global (hindari regresi import). */
  loginWin?: BrowserWindow | null,
): Promise<void> {
  const maxAttempts = NETWORK_RETRY_ATTEMPTS;

  await withWaBrowserSlot(async () => {
    const win = loginWin ?? getNotifierWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('platform-login:phase', {
        sessionId,
        platform: 'whatsapp',
        phase: 'loading',
        message: 'Starting Chrome for WhatsApp…',
      });
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await client.initialize();
        return;
      } catch (error) {
        const retryable =
          isBrowserAlreadyRunningError(error) || isRetryableNetworkError(error);
        if (!retryable || attempt >= maxAttempts - 1) {
          throw error;
        }
        console.warn(
          `[WA init] retry ${attempt + 1}/${maxAttempts}:`,
          error instanceof Error ? error.message : error,
        );
        await destroyWhatsAppSession(sessionId);
        await delayMs(WA_DESTROY_SETTLE_MS + HUMAN_SETTLE_MEDIUM_MS * (attempt + 1));
      }
    }
  });
}

async function destroyWhatsAppSession(
  sessionId: string,
  options?: { clearDiskAuth?: boolean },
): Promise<void> {
  clearQrAppearDeadline(sessionId);
  const session = sessions.get(sessionId);
  if (session) {
    sessions.delete(sessionId);
    await closeWhatsAppPuppeteer(session.client);
    await delayMs(WA_DESTROY_SETTLE_MS);
  }

  if (options?.clearDiskAuth) {
    clearWhatsAppLocalAuth(sessionId);
  }
}

export async function stopWhatsAppLogin(
  sessionId: string,
  options?: { clearDiskAuth?: boolean },
): Promise<void> {
  return runWhatsAppLoginOperation(sessionId, () =>
    destroyWhatsAppSession(sessionId, options),
  );
}

async function emitWhatsAppReady(sessionId: string, win: BrowserWindow) {
  const session = sessions.get(sessionId);
  if (session) session.loggedIn = true;
  if (!win.isDestroyed()) {
    win.webContents.send('platform-login:ready', {
      sessionId,
      platform: 'whatsapp',
    });
  }
}

/** Client sudah hidup dari login QR — jangan buka Puppeteer kedua. */
async function reuseConnectedWhatsAppSession(
  sessionId: string,
  win: BrowserWindow,
): Promise<boolean> {
  const existing = sessions.get(sessionId);
  if (!existing) return false;

  try {
    const state = await existing.client.getState();
    if (state === 'CONNECTED') {
      existing.loggedIn = true;
      await emitWhatsAppReady(sessionId, win);
      return true;
    }
  } catch {
    await destroyWhatsAppSession(sessionId);
  }
  return false;
}

/** Restore dari LocalAuth di disk (tanpa hapus folder). */
export async function restoreWhatsAppFromDisk(
  sessionId: string,
  win: BrowserWindow,
  groupEstimate = 0,
): Promise<boolean> {
  if (await reuseConnectedWhatsAppSession(sessionId, win)) {
    return true;
  }

  const client = createClient(sessionId, 'qr');
  attachCommonHandlers(sessionId, client, win);
  sessions.set(sessionId, { client, mode: 'qr', forwardQrToUi: false });

  const restoreWork = (async () => {
    await initializeClientWithRetry(sessionId, client);
    const state = await client.getState();
    if (state === 'CONNECTED') {
      await emitWhatsAppReady(sessionId, win);
      return true;
    }
    await destroyWhatsAppSession(sessionId);
    return false;
  })();

  const timedOut = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), waDiskRestoreTimeoutMs(groupEstimate));
  });

  try {
    const ok = await Promise.race([restoreWork, timedOut]);
    if (!ok) {
      await destroyWhatsAppSession(sessionId);
    }
    return ok;
  } catch {
    await destroyWhatsAppSession(sessionId);
    return false;
  }
}

/** Login/restore — lock per akun saja (multi-akun paralel). */
function runWhatsAppLoginOperation<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  return withWaSessionLock(sessionId, fn);
}

async function ensureWhatsAppClientInner(
  sessionId: string,
): Promise<InstanceType<typeof Client>> {
  const readyTimeoutMs = waQrScanWaitMs(3000);
  const existing = sessions.get(sessionId);
  if (existing) {
    try {
      const state = await existing.client.getState();
      if (state === 'CONNECTED') {
        existing.loggedIn = true;
        await waitForWhatsAppStoreReady(existing.client);
        return existing.client;
      }
      if (existing.loggedIn) {
        return waitForClientReady(sessionId, existing.client, existing.mode, readyTimeoutMs);
      }
      return waitForClientReady(sessionId, existing.client, existing.mode, readyTimeoutMs);
    } catch {
      await destroyWhatsAppSession(sessionId);
    }
  }

  const client = createClient(sessionId, 'qr');
  attachSessionIntegrityHandlers(sessionId, client);
  const readyPromise = waitForClientReady(sessionId, client, 'qr', readyTimeoutMs);
  sessions.set(sessionId, { client, mode: 'qr' });

  try {
    await initializeClientWithRetry(sessionId, client);
  } catch (error) {
    await destroyWhatsAppSession(sessionId);
    throw error;
  }

  try {
    const state = await client.getState();
    if (state === 'CONNECTED') {
      sessions.set(sessionId, { client, mode: 'qr', loggedIn: true });
      await waitForWhatsAppStoreReady(client);
      return client;
    }
  } catch {
    // wait for ready event
  }

  const readyClient = await readyPromise;
  await waitForWhatsAppStoreReady(readyClient);
  return readyClient;
}

/**
 * Jalankan operasi WA dengan lock per session.
 * Lock tetap aktif sampai scrape/count selesai — hindari client hilang saat getChatById().
 */
export async function withWhatsAppClient<T>(
  sessionId: string,
  fn: (client: InstanceType<typeof Client>) => Promise<T>,
): Promise<T> {
  return withWaSessionLock(sessionId, async () => {
    const client = await ensureWhatsAppClientInner(sessionId);
    if (!client) {
      throw new Error('WA_CLIENT_NOT_READY: WhatsApp client could not be opened. Log in again.');
    }
    return fn(client);
  });
}

/** Restore atau buka sesi WA dari LocalAuth (scrape / validate). */
export async function ensureWhatsAppClient(sessionId: string): Promise<InstanceType<typeof Client>> {
  return withWhatsAppClient(sessionId, (client) => Promise.resolve(client));
}

/** Jangan bunuh Puppeteer hanya karena belum CONNECTED — QR scan butuh waktu (khusus akun besar). */
function armWhatsAppLoginTimeout(
  sessionId: string,
  client: InstanceType<typeof Client>,
  win: BrowserWindow,
  groupEstimate = 0,
) {
  let preQrTimer: ReturnType<typeof setTimeout> | undefined;
  let scanTimer: ReturnType<typeof setTimeout> | undefined;

  const clearAll = () => {
    if (preQrTimer !== undefined) clearTimeout(preQrTimer);
    if (scanTimer !== undefined) clearTimeout(scanTimer);
    preQrTimer = undefined;
    scanTimer = undefined;
  };

  preQrTimer = setTimeout(() => {
    const session = sessions.get(sessionId);
    if (!session || session.loggedIn || (session.qrGeneration ?? 0) > 0) return;
    if (win.isDestroyed()) return;
    win.webContents.send('platform-login:error', {
      sessionId,
      platform: 'whatsapp',
      message:
        'WhatsApp is still starting. Large accounts may take several minutes — wait or tap Refresh QR.',
    });
  }, waQrBootstrapDeadlineMs(groupEstimate));

  client.once('qr', () => {
    if (preQrTimer !== undefined) clearTimeout(preQrTimer);
    preQrTimer = undefined;
    scanTimer = setTimeout(() => {
      void client.getState().then((state) => {
        if (state === 'CONNECTED' || win.isDestroyed()) return;
        if (!win.isDestroyed()) {
          win.webContents.send('platform-login:error', {
            sessionId,
            platform: 'whatsapp',
            message:
              'QR scan timed out. Tap Refresh QR or use phone linking — Chrome stays open until you cancel.',
          });
        }
      });
    }, waQrScanWaitMs(groupEstimate));
  });

  client.once('ready', clearAll);
  client.once('auth_failure', clearAll);
}

function sendWhatsAppLoginError(
  sessionId: string,
  win: BrowserWindow,
  error: unknown,
) {
  if (win.isDestroyed()) return;
  const message = isBrowserAlreadyRunningError(error)
    ? 'WhatsApp is still starting from a previous attempt. Wait a few seconds and tap Sync again.'
    : error instanceof Error
      ? error.message
      : 'WhatsApp failed to start';
  win.webContents.send('platform-login:error', {
    sessionId,
    platform: 'whatsapp',
    message,
  });
}

export async function startWhatsAppQrLogin(
  sessionId: string,
  win: BrowserWindow,
  options?: { skipDiskRestore?: boolean; groupEstimate?: number },
) {
  const groupEstimate = options?.groupEstimate ?? 0;
  return runWhatsAppLoginOperation(sessionId, async () => {
    await forceReleaseWhatsAppForLogin(sessionId, {
      purgeDisk: Boolean(options?.skipDiskRestore),
    });

    if (await reuseConnectedWhatsAppSession(sessionId, win)) {
      return;
    }

    if (!options?.skipDiskRestore) {
      if (await restoreWhatsAppFromDisk(sessionId, win, groupEstimate)) {
        return;
      }
      await forceReleaseWhatsAppForLogin(sessionId);
    }

    const client = createClient(sessionId, 'qr');
    attachCommonHandlers(sessionId, client, win);
    armWhatsAppLoginTimeout(sessionId, client, win, groupEstimate);
    sessions.set(sessionId, { client, mode: 'qr', forwardQrToUi: true, qrGeneration: 0 });

    try {
      armQrAppearDeadline(sessionId, client, win, groupEstimate);
      await initializeClientWithRetry(sessionId, client, win);
    } catch (error) {
      clearQrAppearDeadline(sessionId);
      await destroyWhatsAppSession(sessionId);
      sendWhatsAppLoginError(sessionId, win, error);
    }
  });
}

export async function startWhatsAppPhoneLogin(
  sessionId: string,
  phone: string,
  win: BrowserWindow,
) {
  return runWhatsAppLoginOperation(sessionId, async () => {
    await destroyWhatsAppSession(sessionId);
    clearWhatsAppLocalAuth(sessionId);

    const normalized = normalizeWaPhone(phone);
    const client = createClient(sessionId, 'phone', normalized);
    attachCommonHandlers(sessionId, client, win);
    armWhatsAppLoginTimeout(sessionId, client, win);
    sessions.set(sessionId, { client, mode: 'phone' });

    try {
      await initializeClientWithRetry(sessionId, client, win);
    } catch (error) {
      await destroyWhatsAppSession(sessionId);
      sendWhatsAppLoginError(sessionId, win, error);
    }
  });
}

export function getWhatsAppSessionClient(sessionId: string) {
  return sessions.get(sessionId)?.client ?? null;
}

/** Debug / audit: akun WA yang sedang punya client di memori (satu client per sessionId). */
export function listActiveWhatsAppSessionIds(): string[] {
  return [...sessions.keys()];
}

export function restoreWhatsAppFromDiskForLogin(
  sessionId: string,
  win: BrowserWindow,
): Promise<boolean> {
  return runWhatsAppLoginOperation(sessionId, () => restoreWhatsAppFromDisk(sessionId, win));
}
