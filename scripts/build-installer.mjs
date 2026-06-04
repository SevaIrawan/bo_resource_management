/**
 * Build installer lengkap (Chrome + sidecar + org env + validate + electron-builder).
 * Usage:
 *   node scripts/build-installer.mjs        → OS saat ini
 *   node scripts/build-installer.mjs win
 *   node scripts/build-installer.mjs mac
 *   node scripts/build-installer.mjs linux
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { electronBuilderArgs, resolveBuildTarget } from './lib/cross-platform-artifacts.mjs';
import { npmBin, npxBin, runProcess } from './lib/run-process.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
const target =
  arg && ['win', 'mac', 'linux'].includes(arg) ? arg : resolveBuildTarget(process.platform);

console.log(`Build installer — target: ${target} (host: ${process.platform})`);

if (target === 'mac' && process.platform !== 'darwin') {
  console.warn(
    'PERINGATAN: build Mac dari non-macOS biasanya gagal. Gunakan runner macOS / GitHub Actions.',
  );
}
if (target === 'linux' && process.platform !== 'linux') {
  console.warn(
    'PERINGATAN: build Linux dari Windows/Mac sering gagal untuk sidecar/Chrome. Gunakan runner Linux.',
  );
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
  console.error('ERROR: .env tidak ada. Build dibatalkan.');
  process.exit(1);
}
fs.copyFileSync(envFile, orgDefault);
console.log('OK: org-default.env dari .env');

if (process.env.CI === 'true') {
  runProcess('Validasi CI (typecheck)', npmBin(), ['run', 'typecheck'], { cwd: root });
  runProcess('Validasi paket installer', process.execPath, [
    path.join(root, 'scripts', 'validate-installer-package.mjs'),
  ], { cwd: root });
} else {
  runProcess('Validasi pre-release (desktop + typecheck)', npmBin(), ['run', 'validate:pre-release'], {
    cwd: root,
  });
}

runProcess('Validasi Chrome bundel', process.execPath, [
  path.join(root, 'scripts', 'validate-puppeteer-chrome.mjs'),
], { cwd: root });
runProcess('Vite production build', npxBin(), ['vite', 'build'], { cwd: root });

const ebFlags = electronBuilderArgs(target);
runProcess(`Electron builder (${ebFlags.join(' ')})`, npxBin(), ['electron-builder', ...ebFlags], {
  cwd: root,
});

console.log('\nSelesai. Installer: release/');
console.log('Tim internal: install sekali, login saja. Update berikutnya otomatis (Restart).');
