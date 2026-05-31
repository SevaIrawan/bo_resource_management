import type { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import QRCode from 'qrcode';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;

type WaMode = 'qr' | 'phone';

interface WaSession {
  client: InstanceType<typeof Client>;
  mode: WaMode;
  loggedIn?: boolean;
}

const sessions = new Map<string, WaSession>();
const sessionLocks = new Map<string, Promise<unknown>>();
const WA_INIT_TIMEOUT_MS = 120_000;
const WA_DESTROY_SETTLE_MS = 900;

function waSessionsRoot() {
  return path.join(app.getPath('userData'), 'wa-sessions');
}

function isBrowserAlreadyRunningError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.toLowerCase().includes('browser is already running');
}

async function delayMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

function attachCommonHandlers(
  sessionId: string,
  client: InstanceType<typeof Client>,
  win: BrowserWindow,
) {
  client.on('qr', (qr) => {
    const session = sessions.get(sessionId);
    if (!session || session.mode !== 'qr') return;

    void QRCode.toDataURL(qr, { width: 200, margin: 1 }).then((dataUrl) => {
      if (!win.isDestroyed()) {
        win.webContents.send('platform-login:qr', {
          sessionId,
          platform: 'whatsapp',
          dataUrl,
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

function createClient(sessionId: string, mode: WaMode, phone?: string) {
  const options: ConstructorParameters<typeof Client>[0] = {
    authStrategy: new LocalAuth({
      clientId: sessionId,
      dataPath: waSessionsRoot(),
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  };

  if (mode === 'phone' && phone) {
    options.pairWithPhoneNumber = {
      phoneNumber: phone,
      showNotification: true,
    };
  }

  return new Client(options);
}

function waitForClientReady(
  sessionId: string,
  client: InstanceType<typeof Client>,
  mode: WaMode,
): Promise<InstanceType<typeof Client>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          'WhatsApp session timed out. Use QR or phone linking in Linked Devices.',
        ),
      );
    }, WA_INIT_TIMEOUT_MS);

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

async function initializeClientWithRetry(
  sessionId: string,
  client: InstanceType<typeof Client>,
): Promise<void> {
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await client.initialize();
      return;
    } catch (error) {
      if (!isBrowserAlreadyRunningError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      await destroyWhatsAppSession(sessionId);
      await delayMs(WA_DESTROY_SETTLE_MS * (attempt + 1));
    }
  }
}

async function destroyWhatsAppSession(
  sessionId: string,
  options?: { clearDiskAuth?: boolean },
): Promise<void> {
  const session = sessions.get(sessionId);
  if (session) {
    sessions.delete(sessionId);
    try {
      await session.client.destroy();
    } catch {
      // client may already be destroyed
    }
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
  return withWaSessionLock(sessionId, () => destroyWhatsAppSession(sessionId, options));
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

const WA_DISK_RESTORE_TIMEOUT_MS = 18_000;

/** Restore dari LocalAuth di disk (tanpa hapus folder). */
async function restoreWhatsAppFromDisk(
  sessionId: string,
  win: BrowserWindow,
): Promise<boolean> {
  const client = createClient(sessionId, 'qr');
  attachCommonHandlers(sessionId, client, win);
  sessions.set(sessionId, { client, mode: 'qr' });

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
    setTimeout(() => resolve(false), WA_DISK_RESTORE_TIMEOUT_MS);
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

/** Restore atau buka sesi WA dari LocalAuth (scrape / validate). */
export async function ensureWhatsAppClient(sessionId: string): Promise<InstanceType<typeof Client>> {
  return withWaSessionLock(sessionId, async () => {
    const existing = sessions.get(sessionId);
    if (existing) {
      try {
        const state = await existing.client.getState();
        if (state === 'CONNECTED') {
          existing.loggedIn = true;
          return existing.client;
        }
        return waitForClientReady(sessionId, existing.client, existing.mode);
      } catch {
        await destroyWhatsAppSession(sessionId);
      }
    }

    const client = createClient(sessionId, 'qr');
    const readyPromise = waitForClientReady(sessionId, client, 'qr');
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
        return client;
      }
    } catch {
      // wait for ready event
    }

    return readyPromise;
  });
}

function armWhatsAppLoginTimeout(
  sessionId: string,
  client: InstanceType<typeof Client>,
  win: BrowserWindow,
) {
  const timeout = setTimeout(() => {
    const session = sessions.get(sessionId);
    if (!session) return;

    void session.client.getState().then((state) => {
      if (state === 'CONNECTED' || win.isDestroyed()) return;

      win.webContents.send('platform-login:error', {
        sessionId,
        platform: 'whatsapp',
        message:
          'WhatsApp login timed out. Scan again or use phone linking in Linked Devices.',
      });
      void stopWhatsAppLogin(sessionId);
    });
  }, WA_INIT_TIMEOUT_MS);

  client.once('ready', () => clearTimeout(timeout));
  client.once('auth_failure', () => clearTimeout(timeout));
}

export async function startWhatsAppQrLogin(
  sessionId: string,
  win: BrowserWindow,
  options?: { skipDiskRestore?: boolean },
) {
  return withWaSessionLock(sessionId, async () => {
    await destroyWhatsAppSession(sessionId);

    if (!options?.skipDiskRestore) {
      if (await restoreWhatsAppFromDisk(sessionId, win)) {
        return;
      }
    } else {
      // Session invalid di HP — auth lama di disk bikin initialize hang tanpa event QR.
      clearWhatsAppLocalAuth(sessionId);
    }

    const client = createClient(sessionId, 'qr');
    attachCommonHandlers(sessionId, client, win);
    armWhatsAppLoginTimeout(sessionId, client, win);
    sessions.set(sessionId, { client, mode: 'qr' });

    try {
      await initializeClientWithRetry(sessionId, client);
    } catch (error) {
      await destroyWhatsAppSession(sessionId);
      if (isBrowserAlreadyRunningError(error)) {
        throw new Error(
          'WhatsApp is still starting from a previous attempt. Wait a few seconds and tap Sync again.',
        );
      }
      throw error;
    }
  });
}

export async function startWhatsAppPhoneLogin(
  sessionId: string,
  phone: string,
  win: BrowserWindow,
) {
  return withWaSessionLock(sessionId, async () => {
    await destroyWhatsAppSession(sessionId);
    clearWhatsAppLocalAuth(sessionId);

    const normalized = normalizeWaPhone(phone);
    const client = createClient(sessionId, 'phone', normalized);
    attachCommonHandlers(sessionId, client, win);
    armWhatsAppLoginTimeout(sessionId, client, win);
    sessions.set(sessionId, { client, mode: 'phone' });

    try {
      await initializeClientWithRetry(sessionId, client);
    } catch (error) {
      await destroyWhatsAppSession(sessionId);
      throw error;
    }
  });
}

export function getWhatsAppSessionClient(sessionId: string) {
  return sessions.get(sessionId)?.client ?? null;
}
