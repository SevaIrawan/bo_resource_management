import type { BrowserWindow } from 'electron';
import { spawn, exec, type ChildProcessWithoutNullSignals } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { getEnvFilePath, loadAppEnv } from '../appEnv';
import { withNetworkRetry } from '../lib/networkRetry';

const SIDECAR_URL = 'http://127.0.0.1:8765';
export { SIDECAR_URL };
const SIDECAR_PORT = 8765;
const SIDECAR_VERSION = 4;
const pollTimers = new Map<string, ReturnType<typeof setInterval>>();
const pollErrorStreak = new Map<string, number>();
const POLL_ERROR_MAX_STREAK = 8;

export type LoginMode = 'qr' | 'phone';
export type LoginPhase = 'pending' | 'need_code' | 'need_2fa' | 'ready' | 'error';

function getPythonCommand(): [string, string[]] {
  if (process.platform === 'win32') {
    return ['py', ['-3']];
  }
  return ['python3', []];
}

let sidecarProcess: ChildProcessWithoutNullSignals | null = null;
let sidecarStarting: Promise<void> | null = null;

function projectRoot() {
  return app.isPackaged ? app.getAppPath() : process.cwd();
}

export function sidecarBinaryFileName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'rm-telegram-sidecar.exe' : 'rm-telegram-sidecar';
}

function bundledSidecarPath(): string {
  return path.join(process.resourcesPath, 'sidecar', sidecarBinaryFileName());
}

function resolveSidecarLaunch(): { command: string; args: string[]; cwd: string } {
  if (app.isPackaged) {
    const binary = bundledSidecarPath();
    if (!fs.existsSync(binary)) {
      throw new Error(
        'Komponen Telegram tidak ditemukan di instalasi. Install ulang Resource Management.',
      );
    }
    return { command: binary, args: [], cwd: path.dirname(binary) };
  }

  const root = projectRoot();
  const script = path.join(root, 'python-sidecar', 'main.py');
  const [pythonBin, pythonArgs] = getPythonCommand();
  return { command: pythonBin, args: [...pythonArgs, script], cwd: root };
}

function sidecarEnv(): NodeJS.ProcessEnv {
  loadAppEnv();
  return {
    ...process.env,
    RM_ENV_FILE: getEnvFilePath(),
  };
}

async function parseSidecarJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`Telegram sidecar ${res.status}: empty response`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.trim().slice(0, 160);
    throw new Error(
      `Telegram sidecar ${res.status}: ${snippet || res.statusText}. Restart the app and check TELEGRAM_API_ID / TELEGRAM_API_HASH in .env`,
    );
  }
}

async function waitForHealth(timeoutMs = 25_000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${SIDECAR_URL}/health`, { signal: AbortSignal.timeout(4_000) });
      if (res.ok) return;
    } catch {
      // sidecar still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  throw new Error('Telegram sidecar failed to start');
}

async function readSidecarHealth(): Promise<{
  version: number | null;
  activeScrapes: number;
} | null> {
  try {
    const res = await fetch(`${SIDECAR_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const json = await parseSidecarJson<{ version?: number; activeScrapes?: number }>(res);
    return {
      version: typeof json.version === 'number' ? json.version : null,
      activeScrapes: Math.max(0, Math.floor(Number(json.activeScrapes) || 0)),
    };
  } catch {
    return null;
  }
}

async function readSidecarVersion(): Promise<number | null> {
  const health = await readSidecarHealth();
  return health?.version ?? null;
}

function killProcessOnPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const cmd = `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`;
      exec(cmd, () => resolve());
      return;
    }

    exec(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, () => resolve());
  });
}

export async function ensureSidecarRunning() {
  if (sidecarStarting) {
    await sidecarStarting;
    return;
  }

  sidecarStarting = (async () => {
    try {
      try {
        await waitForHealth(1200);
        const health = await readSidecarHealth();
        if (health?.version === SIDECAR_VERSION) return;

        // Jangan bunuh sidecar saat scrape async masih jalan — putus mid-scrape.
        if (health && health.activeScrapes > 0) {
          console.warn(
            `[telegram-sidecar] version=${health.version}≠${SIDECAR_VERSION} but ${health.activeScrapes} scrape(s) active — skip restart`,
          );
          return;
        }

        // Stale sidecar from an older build — restart so new routes are available.
        await killProcessOnPort(SIDECAR_PORT);
        sidecarProcess = null;
        await new Promise((resolve) => setTimeout(resolve, 600));
      } catch {
        // not running yet
      }

      const launch = resolveSidecarLaunch();
      sidecarProcess = spawn(launch.command, launch.args, {
        cwd: launch.cwd,
        env: sidecarEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      sidecarProcess.stdout?.on('data', (chunk: Buffer) => {
        console.log('[telegram-sidecar]', chunk.toString().trim());
      });
      sidecarProcess.stderr?.on('data', (chunk: Buffer) => {
        console.error('[telegram-sidecar]', chunk.toString().trim());
      });

      sidecarProcess.on('exit', () => {
        sidecarProcess = null;
        sidecarStarting = null;
      });

      await withNetworkRetry('Telegram sidecar boot', () => waitForHealth());

      const version = await readSidecarVersion();
      if (version !== SIDECAR_VERSION) {
        throw new Error('Telegram sidecar started but API version mismatch. Restart the app.');
      }
    } finally {
      sidecarStarting = null;
    }
  })();

  await sidecarStarting;
}

function stopPolling(sessionId: string) {
  const timer = pollTimers.get(sessionId);
  if (timer) {
    clearInterval(timer);
    pollTimers.delete(sessionId);
  }
  pollErrorStreak.delete(sessionId);
}

function isRetryableTelegramPollError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('internal server error') ||
    lower.includes('session not found') ||
    lower.includes('empty response') ||
    lower.includes('invalid json') ||
    lower.includes('econnrefused') ||
    lower.includes('fetch failed') ||
    lower.includes('timed out')
  );
}

function emitTelegramResult(
  win: BrowserWindow,
  sessionId: string,
  json: {
    status: string;
    qrDataUrl?: string | null;
    qrGeneration?: number;
    message?: string | null;
    hint?: string;
  },
) {
  if (json.status === 'ready') {
    stopPolling(sessionId);
    pollErrorStreak.delete(sessionId);
    win.webContents.send('platform-login:ready', { sessionId, platform: 'telegram' });
    return;
  }

  if (json.status === 'confirming') {
    win.webContents.send('platform-login:phase', {
      sessionId,
      platform: 'telegram',
      phase: 'confirming',
      message: json.message ?? json.hint ?? undefined,
    });
    return;
  }

  if (json.status === 'need_code' || json.status === 'need_2fa') {
    stopPolling(sessionId);
    win.webContents.send('platform-login:phase', {
      sessionId,
      platform: 'telegram',
      phase: json.status,
      message: json.message ?? json.hint ?? undefined,
    });
    return;
  }

  if (json.status === 'error') {
    const message = json.message ?? 'Telegram login failed';
    if (isRetryableTelegramPollError(message)) {
      return;
    }
    stopPolling(sessionId);
    win.webContents.send('platform-login:error', {
      sessionId,
      platform: 'telegram',
      message,
    });
    return;
  }

  if (json.qrDataUrl) {
    win.webContents.send('platform-login:qr', {
      sessionId,
      platform: 'telegram',
      dataUrl: json.qrDataUrl,
      generation: json.qrGeneration ?? 1,
    });
  }
}

async function fetchTelegramLoginStatus(sessionId: string) {
  await ensureSidecarRunning();
  const res = await fetch(
    `${SIDECAR_URL}/telegram/login/status/${encodeURIComponent(sessionId)}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  const json = await parseSidecarJson<{
    status: string;
    message?: string;
    hint?: string;
    qrDataUrl?: string;
    qrGeneration?: number;
  }>(res);

  if (!res.ok) {
    const detail = json.message ?? res.statusText;
    throw new Error(`Telegram sidecar ${res.status}: ${detail}`);
  }

  if (json.status === 'error') {
    const message = json.message ?? 'Telegram status failed';
    if (!isRetryableTelegramPollError(message)) {
      throw new Error(message);
    }
  }

  return json;
}

function pollTelegramStatus(sessionId: string, win: BrowserWindow) {
  stopPolling(sessionId);
  pollErrorStreak.set(sessionId, 0);

  const tick = () => {
    void (async () => {
      try {
        const json = await fetchTelegramLoginStatus(sessionId);
        pollErrorStreak.set(sessionId, 0);

        if (win.isDestroyed()) {
          stopPolling(sessionId);
          return;
        }

        emitTelegramResult(win, sessionId, json);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Telegram sidecar error';
        const streak = (pollErrorStreak.get(sessionId) ?? 0) + 1;
        pollErrorStreak.set(sessionId, streak);

        if (streak < POLL_ERROR_MAX_STREAK && isRetryableTelegramPollError(message)) {
          return;
        }

        stopPolling(sessionId);
        if (!win.isDestroyed()) {
          win.webContents.send('platform-login:error', {
            sessionId,
            platform: 'telegram',
            message,
          });
        }
      }
    })();
  };

  tick();
  const timer = setInterval(tick, 300);
  pollTimers.set(sessionId, timer);
}

async function postJson<T>(route: string, body: unknown): Promise<T> {
  await ensureSidecarRunning();
  const res = await fetch(`${SIDECAR_URL}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  const json = await parseSidecarJson<T & { detail?: string; status?: string; message?: string }>(
    res,
  );

  if (!res.ok) {
    const detail = json.detail ?? json.message ?? res.statusText;
    throw new Error(`Telegram sidecar ${res.status}: ${detail}`);
  }

  if (json.status === 'error') {
    throw new Error(json.message ?? 'Telegram login failed');
  }

  return json;
}

function normalizeTelegramResponse(json: {
  status?: string;
  qrDataUrl?: string | null;
  message?: string | null;
  hint?: string;
}) {
  if (!json.status) {
    throw new Error('Telegram sidecar returned an invalid response. Restart the app.');
  }
  return json;
}

export async function startTelegramQrLogin(sessionId: string, win: BrowserWindow) {
  let json: {
    status: string;
    qrDataUrl?: string | null;
    message?: string;
    hint?: string;
  };

  try {
    json = normalizeTelegramResponse(
      await postJson<{
        status: string;
        qrDataUrl?: string | null;
        message?: string;
        hint?: string;
      }>('/telegram/login/qr/start', { sessionId }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('404')) throw error;

    // Legacy sidecar fallback
    json = normalizeTelegramResponse(
      await postJson<{
        status: string;
        qrDataUrl?: string | null;
        message?: string;
        hint?: string;
      }>('/telegram/login/start', { sessionId }),
    );
  }

  if (json.status === 'error') {
    throw new Error(json.message ?? 'Telegram QR login failed to start');
  }

  emitTelegramResult(win, sessionId, json);
  if (json.status === 'pending') {
    pollTelegramStatus(sessionId, win);
  }
}

export async function startTelegramPhoneLogin(
  sessionId: string,
  phone: string,
  win: BrowserWindow,
) {
  const json = await postJson<{
    status: string;
    message?: string;
    hint?: string;
  }>('/telegram/login/phone/start', { sessionId, phone });

  if (json.status === 'error') {
    throw new Error(json.message ?? 'Telegram phone login failed');
  }

  emitTelegramResult(win, sessionId, json);

  if (json.status === 'pending') {
    pollTelegramStatus(sessionId, win);
  }
}

export async function submitTelegramCode(sessionId: string, code: string, win: BrowserWindow) {
  const json = await postJson<{
    status: string;
    message?: string;
    hint?: string;
  }>('/telegram/login/code', { sessionId, code });

  emitTelegramResult(win, sessionId, json);

  if (json.status === 'pending') {
    pollTelegramStatus(sessionId, win);
  }
}

export async function submitTelegram2fa(
  sessionId: string,
  password: string,
  win: BrowserWindow,
) {
  const json = await postJson<{
    status: string;
    message?: string;
    hint?: string;
  }>('/telegram/login/2fa', { sessionId, password });

  emitTelegramResult(win, sessionId, json);

  if (json.status === 'pending') {
    pollTelegramStatus(sessionId, win);
  }
}

export async function stopTelegramLogin(sessionId: string) {
  stopPolling(sessionId);

  try {
    await fetch(`${SIDECAR_URL}/telegram/login/cancel/${sessionId}`, { method: 'POST' });
  } catch {
    // sidecar may already be stopped
  }
}

export function shutdownSidecar() {
  for (const sessionId of pollTimers.keys()) {
    stopPolling(sessionId);
  }

  if (sidecarProcess) {
    sidecarProcess.kill();
    sidecarProcess = null;
    sidecarStarting = null;
  }
}

// Backward-compatible alias
export const startTelegramLogin = startTelegramQrLogin;
