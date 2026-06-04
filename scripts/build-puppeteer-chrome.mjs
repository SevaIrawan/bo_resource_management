/**
 * Unduh Chromium untuk WhatsApp (Puppeteer) — Windows, macOS, atau Linux.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Browser,
  detectBrowserPlatform,
  install,
  resolveBuildId,
} from '@puppeteer/browsers';
import puppeteer from 'puppeteer';
import { findChromeBinaryUnder } from './lib/cross-platform-artifacts.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.resolve(root, 'resources', 'puppeteer-cache');

fs.mkdirSync(cacheDir, { recursive: true });
process.env.PUPPETEER_CACHE_DIR = cacheDir;

console.log(`==> Puppeteer: install Chrome (cache: resources/puppeteer-cache)`);
console.log(`    Platform: ${process.platform}`);

const browserPlatform = detectBrowserPlatform();
if (!browserPlatform) {
  console.error('ERROR: OS tidak didukung untuk unduh Chrome Puppeteer.');
  process.exit(1);
}

try {
  const buildId = await resolveBuildId(Browser.CHROME, browserPlatform, 'latest');
  console.log(`    Build: ${buildId} (${browserPlatform})`);
  const installed = await install({
    browser: Browser.CHROME,
    buildId,
    cacheDir,
    platform: browserPlatform,
  });
  if (installed.executablePath) {
    console.log(`    Installed: ${installed.executablePath}`);
  }
} catch (err) {
  console.error('ERROR: Puppeteer install chrome gagal:', err instanceof Error ? err.message : err);
  process.exit(1);
}

let binary = findChromeBinaryUnder(cacheDir, 0, process.platform);

if (!binary) {
  try {
    const fromPuppeteer = puppeteer.executablePath();
    if (fromPuppeteer && fs.existsSync(fromPuppeteer)) {
      binary = fromPuppeteer;
    }
  } catch {
    // fallback scan folder
  }
}

if (!binary) {
  console.error(`ERROR: Chrome executable tidak ditemukan di cache ${cacheDir}`);
  process.exit(1);
}

console.log(`OK: ${binary}`);
