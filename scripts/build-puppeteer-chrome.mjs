/**
 * Unduh Chromium untuk WhatsApp (Puppeteer) — Windows, macOS, atau Linux.
 * Dipanggil: npm run build:chrome
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { CHROME_BINARY, findChromeBinaryUnder } from './lib/cross-platform-artifacts.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, 'resources', 'puppeteer-cache');
const chromeRoot = path.join(cacheDir, 'chrome');

fs.mkdirSync(cacheDir, { recursive: true });

console.log(`==> Puppeteer: install Chrome (cache: resources/puppeteer-cache)`);
console.log(`    Platform: ${process.platform}, binary: ${CHROME_BINARY}`);

const env = { ...process.env, PUPPETEER_CACHE_DIR: cacheDir };
const install = spawnSync('npx', ['puppeteer', 'browsers', 'install', 'chrome'], {
  cwd: root,
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

if (!fs.existsSync(chromeRoot)) {
  console.error(`ERROR: Chrome tidak ada di ${chromeRoot} setelah install.`);
  process.exit(1);
}

const binary = findChromeBinaryUnder(chromeRoot);
if (!binary) {
  console.error(`ERROR: ${CHROME_BINARY} tidak ditemukan di bawah ${chromeRoot}`);
  process.exit(1);
}

console.log(`OK: ${binary}`);
