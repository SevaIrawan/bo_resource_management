/**
 * Validasi konfigurasi + artefak (jika ada) untuk Win, Mac, Linux sekaligus.
 * Dipanggil dari CI gate atau lokal setelah merge folder release/.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hostMatchesTarget } from './lib/installer-bundle-manifest.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

console.log(`=== Validasi 3 platform — v${version} ===\n`);

const steps = [
  ['installer-electron-config', 'validate-installer-electron-config.mjs', []],
  ['cross-platform-build', 'validate-cross-platform-build.mjs', []],
];

for (const target of ['win', 'mac', 'linux']) {
  steps.push([`installer-package:${target}`, 'validate-installer-package.mjs', [target]]);
  if (hostMatchesTarget(target)) {
    steps.push([`release-artifact:${target}`, 'validate-release-artifact.mjs', [target]]);
  }
}

const release = path.join(root, 'release');
if (fs.existsSync(release)) {
  const hasWin = fs.readdirSync(release).some((n) => /\.exe$/i.test(n) && /Setup/i.test(n));
  const hasMac = fs.readdirSync(release).some((n) => /\.dmg$/i.test(n));
  const hasMacZip = fs.readdirSync(release).some((n) => /\.zip$/i.test(n) && /arm64/i.test(n));
  const hasLinux = fs.readdirSync(release).some((n) => /\.AppImage$/i.test(n));
  if (hasWin && hasMac && hasMacZip && hasLinux) {
    steps.push(['release-upload-merge', 'validate-release-upload.mjs', ['release']]);
  }
}

let failed = 0;
for (const [label, script, args] of steps) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  const ok = r.status === 0;
  console.log(`${ok ? 'OK' : 'FAIL'}  ${label}\n`);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`${failed} cek gagal.`);
  process.exit(1);
}
console.log('Semua cek 3 platform lulus.');
