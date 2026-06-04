/**
 * Satu sumber kebenaran: apa yang harus ada di installer per OS (Win / Mac / Linux).
 */
import fs from 'fs';
import path from 'path';
import { resolveBuildTarget } from './cross-platform-artifacts.mjs';

/** @typedef {'win' | 'mac' | 'linux'} BuildTarget */

/** @param {BuildTarget | string} target */
export function platformForBuildTarget(target) {
  if (target === 'win') return 'win32';
  if (target === 'mac') return 'darwin';
  if (target === 'linux') return 'linux';
  throw new Error(`Unknown build target: ${target}`);
}

/** @param {BuildTarget | string} target */
export function hostMatchesTarget(target) {
  try {
    return resolveBuildTarget(process.platform) === target;
  } catch {
    return false;
  }
}

/** @param {string} root @param {BuildTarget} target */
export function findMacResourcesDir(root) {
  const macDir = path.join(root, 'release', 'mac');
  if (!fs.existsSync(macDir)) return null;
  for (const name of fs.readdirSync(macDir)) {
    if (!name.endsWith('.app')) continue;
    const resources = path.join(macDir, name, 'Contents', 'Resources');
    if (fs.existsSync(resources)) return resources;
  }
  return null;
}

/**
 * Folder `resources/` di artefak electron-builder setelah pack.
 * @param {string} root
 * @param {BuildTarget} target
 */
export function packagedResourcesDir(root, target) {
  if (target === 'win') {
    return path.join(root, 'release', 'win-unpacked', 'resources');
  }
  if (target === 'linux') {
    return path.join(root, 'release', 'linux-unpacked', 'resources');
  }
  return findMacResourcesDir(root);
}

/**
 * @param {string} root
 * @param {BuildTarget} target
 */
export function expectedInstallerArtifacts(root, target) {
  const release = path.join(root, 'release');
  if (target === 'win') {
    return {
      unpacked: path.join(release, 'win-unpacked'),
      patterns: ['.exe'],
      excludeUnpacked: false,
    };
  }
  if (target === 'mac') {
    return {
      unpacked: path.join(release, 'mac'),
      patterns: ['.dmg'],
      excludeUnpacked: true,
    };
  }
  return {
    unpacked: path.join(release, 'linux-unpacked'),
    patterns: ['.AppImage'],
    excludeUnpacked: false,
  };
}

/**
 * @param {string} dir
 * @param {string[]} extensions e.g. ['.exe']
 */
export function findReleaseFiles(dir, extensions) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isFile() && extensions.some((ext) => name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/** @param {BuildTarget | undefined} arg */
export function parseBuildTargetArg(arg) {
  const fromEnv = process.env.BUILD_TARGET?.trim();
  const raw = arg || fromEnv;
  if (raw && ['win', 'mac', 'linux'].includes(raw)) return raw;
  return resolveBuildTarget(process.platform);
}
