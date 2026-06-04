/**
 * Audit statis rantai build installer — tanpa network, tanpa GitHub.
 * Usage: node scripts/audit-installer-pipeline.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { electronBuilderArgs } from './lib/cross-platform-artifacts.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

console.log('=== Audit pipeline installer (lokal) ===\n');
console.log(`Versi package.json: ${pkg.version}`);
console.log(`Host: ${process.platform}\n`);

const entryPoints = [
  ['CI Win', '.github/workflows/release-multiplatform.yml', 'npm run build:installer:win'],
  ['CI Mac', '.github/workflows/release-multiplatform.yml', 'npm run build:installer:mac'],
  ['CI Linux', '.github/workflows/release-multiplatform.yml', 'npm run build:installer:linux'],
  ['Lokal', 'scripts/build-installer.mjs', 'node scripts/build-installer.mjs <win|mac|linux>'],
  ['Publish manual', 'scripts/publish-release.mjs', '--config electron-builder.publish.mjs + --prepackaged'],
];

console.log('\n--- Tiga platform (sama skrip, beda runner OS) ---');
console.log('  Windows → build:installer:win  → release/*.exe + win-unpacked');
console.log('  macOS   → build:installer:mac  → release/*.dmg + *.zip + mac-arm64/*.app');
console.log('  Linux   → build:installer:linux → release/*.AppImage + linux-unpacked');
console.log('  Chrome/sidecar di-cache per OS saat build (tidak bisa build Mac dari Windows).');

console.log('--- Entry point ---');
for (const [label, file, cmd] of entryPoints) {
  const exists = fs.existsSync(path.join(root, file.split('/').join(path.sep)));
  console.log(`${exists ? 'OK' : 'MISSING'}  ${label}: ${file}`);
  console.log(`       → ${cmd}`);
}

console.log('\n--- electronBuilderArgs (runtime) ---');
for (const t of ['win', 'mac', 'linux']) {
  const args = electronBuilderArgs(t);
  const bad = args.includes('--config') || args.some((a) => a.includes('publish.json'));
  console.log(`${bad ? 'FAIL' : 'OK'}  ${t}: ${args.join(' ')}`);
}

const build = pkg.build ?? {};
console.log('\n--- package.json build ---');
console.log(`output: ${build.directories?.output ?? '(tidak ada)'}`);
console.log(`win.target: ${JSON.stringify(build.win?.target)}`);
console.log(`mac.target: ${JSON.stringify(build.mac?.target)}`);
console.log(`linux.target: ${JSON.stringify(build.linux?.target)}`);
console.log(`publish di build: ${build.publish ? 'YA (bahaya)' : 'tidak'}`);
console.log(`files exclude sidecar-build: ${(build.files ?? []).some((f) => String(f).includes('sidecar-build'))}`);

const installer = fs.readFileSync(path.join(root, 'scripts', 'build-installer.mjs'), 'utf8');
const order = [
  ['build-puppeteer-chrome.mjs', installer.includes('build-puppeteer-chrome.mjs')],
  ['build-telegram-sidecar.mjs', installer.includes('build-telegram-sidecar.mjs')],
  ['validate-org-env / copy .env', installer.includes('org-default.env')],
  ['vite build', installer.includes('vite')],
  ['cleanSidecarBuildDirs', installer.includes('cleanSidecarBuildDirs')],
  ['validate-installer-electron-config', installer.includes('validate-installer-electron-config')],
  ['electron-builder', installer.includes('electron-builder/cli.js')],
  ['validate-release-artifact', installer.includes('validate-release-artifact.mjs')],
];

console.log('\n--- Urutan build-installer.mjs ---');
for (const [step, ok] of order) {
  console.log(`${ok ? 'OK' : 'MISSING'}  ${step}`);
}

const deprecated = ['build:app:win', 'build:dir'];
console.log('\n--- Script deprecated (harus exit 1) ---');
for (const s of deprecated) {
  const cmd = String(pkg.scripts?.[s] ?? '');
  const dep = cmd.includes('DEPRECATED') || cmd.includes('process.exit(1)');
  console.log(`${dep ? 'OK' : 'FAIL'}  ${s}`);
}

console.log('\nSelesai audit statis. Build penuh: npm run build:installer:win (butuh .env + Python).');
