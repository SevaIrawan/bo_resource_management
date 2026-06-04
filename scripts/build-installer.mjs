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
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { electronBuilderArgs, resolveBuildTarget } from './lib/cross-platform-artifacts.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
const target =
  arg && ['win', 'mac', 'linux'].includes(arg) ? arg : resolveBuildTarget(process.platform);

function run(label, cmd, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

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

run('Chrome untuk WhatsApp (Puppeteer)', 'npm', ['run', 'build:chrome']);
run('Sidecar Telegram', 'npm', ['run', 'build:sidecar']);
run('Validasi .env organisasi', 'node', ['scripts/validate-org-env.mjs']);

const envFile = path.join(root, '.env');
const orgDefault = path.join(root, 'resources', 'org-default.env');
if (!fs.existsSync(envFile)) {
  console.error('ERROR: .env tidak ada. Build dibatalkan.');
  process.exit(1);
}
fs.copyFileSync(envFile, orgDefault);
console.log('OK: org-default.env dari .env');

if (process.env.CI === 'true') {
  run('Validasi CI (installer + typecheck)', 'npm', ['run', 'typecheck']);
  run('Validasi paket installer', 'node', ['scripts/validate-installer-package.mjs']);
} else {
  run('Validasi pre-release (desktop + typecheck)', 'npm', ['run', 'validate:pre-release']);
}
run('Validasi Chrome bundel', 'node', ['scripts/validate-puppeteer-chrome.mjs']);
run('Vite production build', 'npx', ['vite', 'build']);

const ebFlags = electronBuilderArgs(target);
run(`Electron builder (${ebFlags.join(' ')})`, 'npx', ['electron-builder', ...ebFlags]);

console.log('\nSelesai. Installer: release/');
console.log('Tim internal: install sekali, login saja. Update berikutnya otomatis (Restart).');
