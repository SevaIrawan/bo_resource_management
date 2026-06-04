/**
 * Nama artefak bundel installer per OS — satu sumber untuk skrip build & validator.
 */
import fs from 'fs';
import path from 'path';

export const CHROME_BINARY = process.platform === 'win32' ? 'chrome.exe' : 'chrome';

/** @param {NodeJS.Platform | string} [platform] */
export function sidecarBinaryName(platform = process.platform) {
  return platform === 'win32' ? 'rm-telegram-sidecar.exe' : 'rm-telegram-sidecar';
}

/** @param {string} root @param {NodeJS.Platform | string} [platform] */
export function sidecarResourcePath(root, platform = process.platform) {
  return path.join(root, 'resources', 'sidecar', sidecarBinaryName(platform));
}

/** @param {string} dir @param {number} [depth] */
export function findChromeBinaryUnder(dir, depth = 0) {
  if (depth > 10 || !fs.existsSync(dir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === CHROME_BINARY) return full;
    if (entry.isDirectory()) {
      const nested = findChromeBinaryUnder(full, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

/** @param {'win' | 'mac' | 'linux'} target */
export function electronBuilderArgs(target) {
  if (target === 'win') return ['--win'];
  if (target === 'mac') return ['--mac'];
  if (target === 'linux') return ['--linux'];
  throw new Error(`Unknown build target: ${target}`);
}

/** @param {NodeJS.Platform | string} [platform] */
export function resolveBuildTarget(platform = process.platform) {
  if (platform === 'win32') return 'win';
  if (platform === 'darwin') return 'mac';
  if (platform === 'linux') return 'linux';
  throw new Error(`Unsupported platform: ${platform}`);
}
