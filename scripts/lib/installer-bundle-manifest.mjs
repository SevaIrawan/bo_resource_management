/**
 * Satu sumber kebenaran: apa yang harus ada di installer per OS (Win / Mac / Linux).
 */
import fs from 'fs';
import path from 'path';
import { resolveBuildTarget } from './cross-platform-artifacts.mjs';

/** @typedef {'win' | 'mac' | 'linux'} BuildTarget */

/** electron-builder: mac-arm64 (GHA Apple Silicon), mac-x64, mac-universal, atau mac. */
const MAC_UNPACKED_DIR_NAMES = ['mac-arm64', 'mac-x64', 'mac-universal', 'mac'];

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

/** @param {string} dir */
function findAppBundleInDir(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.app')) continue;
    const appPath = path.join(dir, name);
    if (fs.statSync(appPath).isDirectory()) return appPath;
  }
  return null;
}

/**
 * Folder unpacked .app setelah electron-builder --mac (mis. release/mac-arm64).
 * @param {string} root
 */
export function findMacUnpackedDir(root) {
  const release = path.join(root, 'release');
  if (!fs.existsSync(release)) return null;

  for (const dirName of MAC_UNPACKED_DIR_NAMES) {
    const dir = path.join(release, dirName);
    if (findAppBundleInDir(dir)) return dir;
  }

  for (const name of fs.readdirSync(release)) {
    if (!name.startsWith('mac')) continue;
    const dir = path.join(release, name);
    try {
      if (fs.statSync(dir).isDirectory() && findAppBundleInDir(dir)) return dir;
    } catch {
      // skip
    }
  }
  return null;
}

/** @param {string} root */
export function findMacResourcesDir(root) {
  const unpacked = findMacUnpackedDir(root);
  if (!unpacked) return null;
  const appPath = findAppBundleInDir(unpacked);
  if (!appPath) return null;
  const resources = path.join(appPath, 'Contents', 'Resources');
  return fs.existsSync(resources) ? resources : null;
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
      unpacked: findMacUnpackedDir(root) ?? path.join(release, 'mac-arm64'),
      patterns: ['.dmg'],
      excludeUnpacked: false,
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

/** @param {string} root @param {'win'|'mac'|'linux'} target */
export function resolvePrepackagedDir(root, target) {
  if (target === 'win') return path.join(root, 'release', 'win-unpacked');
  if (target === 'linux') return path.join(root, 'release', 'linux-unpacked');
  const macDir = findMacUnpackedDir(root);
  if (macDir) return macDir;
  return path.join(root, 'release', 'mac-arm64');
}
