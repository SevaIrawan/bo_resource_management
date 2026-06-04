/**
 * Build installer lengkap (Chrome + sidecar + org env + validate + electron-builder).
 * Win / Mac / Linux — harus di runner OS yang sama (CI: matrix build-win / build-mac / build-linux).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  cleanOldReleaseInstallers,
  cleanSidecarBuildDirs,
  cleanStaleNsisArtifacts,
} from './lib/clean-installer-pack-artifacts.mjs';
import { electronBuilderArgs, resolveBuildTarget } from './lib/cross-platform-artifacts.mjs';
import { hostMatchesTarget } from './lib/installer-bundle-manifest.mjs';
import { runProcess, runNpm, runProjectTool } from './lib/run-process.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
const target =
  arg && ['win', 'mac', 'linux'].includes(arg) ? arg : resolveBuildTarget(process.platform);

process.env.BUILD_TARGET = target;

console.log(`Build installer — target: ${target} (host: ${process.platform})`);

if (!hostMatchesTarget(target)) {
  const msg =
    `Build target "${target}" harus di runner OS yang sama (host: ${process.platform}). ` +
    'Gunakan GitHub Actions matrix: build-win / build-mac / build-linux.';
  if (process.env.CI === 'true') {
    console.error(`ERROR: ${msg}`);
    process.exit(1);
  }
  console.warn(`PERINGATAN: ${msg}`);
}

runProcess('Chrome untuk WhatsApp (Puppeteer)', process.execPath, [
  path.join(root, 'scripts', 'build-puppeteer-chrome.mjs'),
], { cwd: root });
runProcess('Sidecar Telegram', process.execPath, [
  path.join(root, 'scripts', 'build-telegram-sidecar.mjs'),
], { cwd: root });
runProcess('Validasi .env organisasi', process.execPath, [
  path.join(root, 'scripts', 'validate-org-env.mjs'),
], { cwd: root });

const envFile = path.join(root, '.env');
const orgDefault = path.join(root, 'resources', 'org-default.env');
if (!fs.existsSync(envFile)) {
  console.error('ERROR: .env tidak ada di root project.');
  console.error('Wajib 4 kunci: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_API_ID, TELEGRAM_API_HASH');
  console.error('(Disalin ke org-default.env di installer — user akhir tidak isi manual.)');
  process.exit(1);
}
fs.copyFileSync(envFile, orgDefault);
console.log('OK: org-default.env dari .env');

const validateArgs = [target];

if (process.env.CI === 'true') {
  runProjectTool(root, 'Validasi CI (typecheck)', 'typescript/bin/tsc', ['--noEmit']);
  runProcess('Validasi runtime installer (QR, 3k grup, ticket)', process.execPath, [
    path.join(root, 'scripts', 'validate-installer-runtime.mjs'),
  ], { cwd: root });
  runProcess('Validasi paket installer', process.execPath, [
    path.join(root, 'scripts', 'validate-installer-package.mjs'),
    ...validateArgs,
  ], { cwd: root });
} else {
  runNpm(root, 'Validasi pre-release (desktop + typecheck)', ['run', 'validate:pre-release']);
  runProcess('Validasi paket installer (target)', process.execPath, [
    path.join(root, 'scripts', 'validate-installer-package.mjs'),
    ...validateArgs,
  ], { cwd: root });
}

runProcess('Validasi Chrome bundel', process.execPath, [
  path.join(root, 'scripts', 'validate-puppeteer-chrome.mjs'),
  ...validateArgs,
], { cwd: root });
runProjectTool(root, 'Vite production build', 'vite/bin/vite.js', ['build']);

const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
cleanSidecarBuildDirs(root);
cleanStaleNsisArtifacts(root);
cleanOldReleaseInstallers(root, pkgVersion);

runProcess('Validasi konfigurasi electron-builder', process.execPath, [
  path.join(root, 'scripts', 'validate-installer-electron-config.mjs'),
], { cwd: root });

if (target === 'win' && process.platform === 'win32') {
  runProcess('Prepare winCodeSign cache (Windows)', 'powershell', [
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(root, 'scripts', 'prepare-win-codesign-cache.ps1'),
  ], { cwd: root });
}

const ebFlags = electronBuilderArgs(target);
runProjectTool(root, `Electron builder (${ebFlags.join(' ')})`, 'electron-builder/cli.js', ebFlags);

runProcess('Validasi artefak release (bundel di installer)', process.execPath, [
  path.join(root, 'scripts', 'validate-release-artifact.mjs'),
  ...validateArgs,
], { cwd: root });

console.log('\nSelesai. Installer: release/');
console.log('User client: jalankan installer sekali — Chrome, Telegram, Supabase, WA/TG sudah terbundel.');
