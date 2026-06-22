import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

function chromeBinaryNames(): string[] {
  if (process.platform === 'win32') return ['chrome.exe'];
  if (process.platform === 'darwin') {
    return ['Google Chrome for Testing', 'chrome', 'Chromium'];
  }
  return ['chrome', 'google-chrome', 'chromium', 'chrome-browser'];
}

function findChromeExeUnder(dir: string, depth = 0): string | null {
  if (depth > 14 || !fs.existsSync(dir)) return null;

  const names = new Set(chromeBinaryNames());
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && names.has(entry.name)) {
      return full;
    }
    if (entry.isDirectory()) {
      const nested = findChromeExeUnder(full, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

function devChromeSearchRoot(): string {
  const candidates = [
    path.join(process.cwd(), 'resources', 'puppeteer-cache', 'chrome'),
    path.join(app.getAppPath(), 'resources', 'puppeteer-cache', 'chrome'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

function bundledChromeSearchRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'puppeteer-chrome', 'chrome');
  }
  return devChromeSearchRoot();
}

/** Argumen launch WA — Chrome headless baru + off-screen (cegah kotak putih di Windows). */
export function waClientPuppeteerOptions(): {
  headless: boolean;
  executablePath: string;
  args: string[];
  protocolTimeout: number;
} {
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--no-first-run',
    '--disable-translate',
    '--disable-features=TranslateUI',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ];

  if (process.platform === 'win32') {
    args.push('--window-position=-24000,-24000', '--window-size=800,600');
  }

  return {
    headless: true,
    executablePath: resolveWaChromeExecutable(),
    args,
    protocolTimeout: Math.max(
      180_000,
      Math.floor(Number(process.env.RM_WA_PROTOCOL_TIMEOUT_MS) || 600_000),
    ),
  };
}

/** Chrome headless untuk whatsapp-web.js — terbundel di installer, bukan cache user. */
export function resolveWaChromeExecutable(): string {
  const bundled = findChromeExeUnder(bundledChromeSearchRoot());
  if (bundled) return bundled;

  try {
    const fromCache = puppeteer.executablePath();
    if (fromCache && fs.existsSync(fromCache)) return fromCache;
  } catch {
    // cache kosong di PC user
  }

  throw new Error(
    'Chrome untuk WhatsApp tidak ditemukan di instalasi ini. Tutup app, install ulang dari installer terbaru IT, lalu coba Sync lagi.',
  );
}
