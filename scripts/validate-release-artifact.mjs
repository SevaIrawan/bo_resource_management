/**
 * Post-build: pastikan artefak di release/ untuk target win|mac|linux (versi package.json).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  findChromeBinaryUnder,
  sidecarBinaryName,
} from './lib/cross-platform-artifacts.mjs';
import {
  expectedInstallerArtifacts,
  findMacUnpackedDir,
  findReleaseFiles,
  packagedResourcesDir,
  parseBuildTargetArg,
  platformForBuildTarget,
} from './lib/installer-bundle-manifest.mjs';
import { missingOrgEnvKeys } from './lib/org-env-required.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = parseBuildTargetArg(process.argv[2]);
const platform = platformForBuildTarget(target);
const sidecarName = sidecarBinaryName(platform);
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const releaseDir = path.join(root, 'release');

const { unpacked, excludeUnpacked } = expectedInstallerArtifacts(root, target);
const resourcesDir = packagedResourcesDir(root, target);

const errors = [];

function releaseFiles() {
  if (!fs.existsSync(releaseDir)) return [];
  return fs.readdirSync(releaseDir).filter((n) => fs.statSync(path.join(releaseDir, n)).isFile());
}

function pickVersioned(nameTest) {
  const hits = releaseFiles().filter((n) => nameTest(n) && n.includes(version));
  return hits.length ? hits : releaseFiles().filter(nameTest);
}

if (target === 'win') {
  const exes = pickVersioned((n) => /\.exe$/i.test(n) && /Setup/i.test(n));
  if (exes.length === 0) {
    errors.push(`Tidak ada Windows Setup .exe versi ${version} di release/`);
  }
} else if (target === 'mac') {
  const dmgs = pickVersioned((n) => /\.dmg$/i.test(n));
  const zips = pickVersioned((n) => /\.zip$/i.test(n) && /arm64/i.test(n));
  if (dmgs.length === 0) {
    errors.push(`Tidak ada .dmg Mac versi ${version} di release/`);
  }
  if (zips.length === 0) {
    errors.push(`Tidak ada .zip arm64 Mac versi ${version} di release/ (wajib auto-update)`);
  }
} else if (target === 'linux') {
  const images = pickVersioned((n) => /\.AppImage$/i.test(n));
  if (images.length === 0) {
    errors.push(`Tidak ada .AppImage Linux versi ${version} di release/`);
  }
}

if (!excludeUnpacked && !fs.existsSync(unpacked)) {
  errors.push(`Folder unpacked tidak ada: ${unpacked}`);
}

if (!resourcesDir || !fs.existsSync(resourcesDir)) {
  errors.push(`resources/ tidak ada untuk target ${target}: ${resourcesDir ?? '(mac .app tidak ditemukan)'}`);
} else {
  const chromeRoot = path.join(resourcesDir, 'puppeteer-chrome', 'chrome');
  const chromeExe = findChromeBinaryUnder(chromeRoot, 0, platform);
  if (!chromeExe) {
    errors.push(`Chrome WhatsApp tidak ada di ${chromeRoot}`);
  }

  const sidecarPath = path.join(resourcesDir, 'sidecar', sidecarName);
  if (!fs.existsSync(sidecarPath)) {
    errors.push(`Sidecar Telegram tidak ada: ${sidecarPath}`);
  } else if (platform !== 'win32') {
    try {
      fs.accessSync(sidecarPath, fs.constants.X_OK);
    } catch {
      errors.push(`Sidecar tidak executable: ${sidecarPath}`);
    }
  }

  for (const envName of ['org-default.env', 'env-template.env']) {
    const envPath = path.join(resourcesDir, envName);
    if (!fs.existsSync(envPath)) {
      errors.push(`${envName} tidak ada di resources/`);
      continue;
    }
    if (envName === 'org-default.env') {
      const missing = missingOrgEnvKeys(dotenv.parse(fs.readFileSync(envPath)));
      if (missing.length) {
        errors.push(`org-default.env kurang kunci: ${missing.join(', ')}`);
      }
    }
  }

  const asarPath = path.join(resourcesDir, 'app.asar');
  if (!fs.existsSync(asarPath)) {
    errors.push('app.asar tidak ada');
  }

  const unpackedNm = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules');
  for (const mod of ['whatsapp-web.js', 'puppeteer']) {
    const modPath = path.join(unpackedNm, mod);
    if (!fs.existsSync(modPath)) {
      errors.push(`asarUnpack: node_modules/${mod} tidak ada di ${modPath}`);
    }
  }
}

if (target === 'mac' && !findMacUnpackedDir(root)) {
  errors.push(
    'Resource Management.app tidak ditemukan di release/mac-arm64, mac-x64, atau mac/',
  );
}

if (errors.length) {
  console.error(`[validate-release-artifact] GAGAL — target ${target} v${version}\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const listed =
  target === 'win'
    ? pickVersioned((n) => /\.exe$/i.test(n) && /Setup/i.test(n))
    : target === 'mac'
      ? [
          ...pickVersioned((n) => /\.dmg$/i.test(n)),
          ...pickVersioned((n) => /\.zip$/i.test(n)),
        ]
      : pickVersioned((n) => /\.AppImage$/i.test(n));

console.log(`[validate-release-artifact] OK — target ${target} v${version}`);
console.log(`  installer: ${listed.join(', ')}`);
console.log(`  resources: ${resourcesDir}`);
console.log(`  sidecar: ${sidecarName}`);
console.log('  bundel: Chrome, Telegram sidecar, org env, whatsapp-web.js, puppeteer');
