import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const CHROME_BINARY = process.platform === 'win32' ? 'chrome.exe' : 'chrome';

function findChromeExeUnder(dir: string, depth = 0): string | null {
  if (depth > 10 || !fs.existsSync(dir)) return null;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === CHROME_BINARY) {
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
