/**
 * Nama artefak bundel installer per OS — satu sumber untuk skrip build & validator.
 */
import fs from 'fs';
import path from 'path';

export const CHROME_BINARY = process.platform === 'win32' ? 'chrome.exe' : 'chrome';

/** Nama executable Chrome per platform (Puppeteer cache). */
export function chromeBinaryNames(platform = process.platform) {
  if (platform === 'win32') return ['chrome.exe'];
  if (platform === 'darwin') return ['Google Chrome for Testing', 'chrome', 'Chromium'];
  return ['chrome', 'google-chrome', 'chromium', 'chrome-browser'];
}

/** @param {NodeJS.Platform | string} [platform] */
export function sidecarBinaryName(platform = process.platform) {
  return platform === 'win32' ? 'rm-telegram-sidecar.exe' : 'rm-telegram-sidecar';
}

/** @param {string} root @param {NodeJS.Platform | string} [platform] */
export function sidecarResourcePath(root, platform = process.platform) {
  return path.join(root, 'resources', 'sidecar', sidecarBinaryName(platform));
}

/** @param {string} dir @param {number} [depth] @param {NodeJS.Platform | string} [platform] */
export function findChromeBinaryUnder(dir, depth = 0, platform = process.platform) {
  if (depth > 14 || !fs.existsSync(dir)) return null;
  const names = new Set(chromeBinaryNames(platform));
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && names.has(entry.name)) return full;
    if (entry.isDirectory()) {
      const nested = findChromeBinaryUnder(full, depth + 1, platform);
      if (nested) return nested;
    }
  }
  return null;
}

/** @param {'win' | 'mac' | 'linux'} target */
export function electronBuilderArgs(target) {
  const args =
    target === 'win' ? ['--win'] : target === 'mac' ? ['--mac'] : target === 'linux' ? ['--linux'] : null;
  if (!args) throw new Error(`Unknown build target: ${target}`);

  // Installer build saja — jangan upload GitHub (butuh GH_TOKEN). Publish via publish-release.mjs.
  return [...args, '--publish', 'never'];
}

/** @param {NodeJS.Platform | string} [platform] */
export function resolveBuildTarget(platform = process.platform) {
  if (platform === 'win32') return 'win';
  if (platform === 'darwin') return 'mac';
  if (platform === 'linux') return 'linux';
  throw new Error(`Unsupported platform: ${platform}`);
}
