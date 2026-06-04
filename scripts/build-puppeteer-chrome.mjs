/**
 * Unduh Chromium untuk WhatsApp (Puppeteer) — Windows, macOS, atau Linux.
 * Dipanggil: npm run build:chrome
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { findChromeBinaryUnder } from './lib/cross-platform-artifacts.mjs';
import { runProcess } from './lib/run-process.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const puppeteerBrowsersCli = path.join(
  root,
  'node_modules',
  '@puppeteer',
  'browsers',
  'lib',
  'cjs',
  'main-cli.js',
);
const cacheDir = path.join(root, 'resources', 'puppeteer-cache');
const chromeRoot = path.join(cacheDir, 'chrome');

fs.mkdirSync(cacheDir, { recursive: true });
process.env.PUPPETEER_CACHE_DIR = cacheDir;

console.log(`==> Puppeteer: install Chrome (cache: resources/puppeteer-cache)`);
console.log(`    Platform: ${process.platform}`);

if (!fs.existsSync(puppeteerBrowsersCli)) {
  console.error(`ERROR: ${puppeteerBrowsersCli} tidak ada. Jalankan npm ci dulu.`);
  process.exit(1);
}

runProcess('puppeteer browsers install chrome', process.execPath, [puppeteerBrowsersCli, 'install', 'chrome'], {
  cwd: root,
  env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir },
});

if (!fs.existsSync(chromeRoot)) {
  console.error(`ERROR: Chrome tidak ada di ${chromeRoot} setelah install.`);
  process.exit(1);
}

let binary = null;
try {
  const fromPuppeteer = puppeteer.executablePath();
  if (fromPuppeteer && fs.existsSync(fromPuppeteer)) {
    binary = fromPuppeteer;
  }
} catch {
  // fallback scan folder
}

if (!binary) {
  binary = findChromeBinaryUnder(chromeRoot);
}

if (!binary) {
  console.error(`ERROR: Chrome executable tidak ditemukan di ${chromeRoot}`);
  console.error('  Coba: npm run build:chrome ulang atau hapus folder resources/puppeteer-cache');
  process.exit(1);
}

console.log(`OK: ${binary}`);
