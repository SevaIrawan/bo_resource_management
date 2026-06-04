/**
 * Hard gate sebelum electron-builder: konfigurasi pack harus dari package.json,
 * bukan electron-builder.publish.json (hanya publish), dan venv PyInstaller tidak boleh ikut asar.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { electronBuilderArgs } from './lib/cross-platform-artifacts.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const build = pkg.build ?? {};
const files = build.files ?? [];

const errors = [];

for (const target of ['win', 'mac', 'linux']) {
  const args = electronBuilderArgs(target);
  if (args.some((a) => a.includes('electron-builder.publish.json'))) {
    errors.push(`electronBuilderArgs(${target}) masih memuat publish.json — pack akan salah (output dist/)`);
  }
  if (args.includes('--config')) {
    errors.push(`electronBuilderArgs(${target}) memakai --config — harus hanya package.json`);
  }
}

if (build.directories?.output !== 'release') {
  errors.push(`build.directories.output harus "release", dapat: ${build.directories?.output ?? '(kosong)'}`);
}

if (build.publish) {
  errors.push('build.publish di package.json — electron-builder bisa minta GH_TOKEN saat build:installer');
}

const hasSidecarExclude =
  files.some((f) => String(f).includes('!resources/sidecar-build')) &&
  files.some((f) => String(f).includes('!resources/sidecar-dist'));
if (!hasSidecarExclude) {
  errors.push('build.files harus exclude !resources/sidecar-build/** dan !resources/sidecar-dist/**');
}

const installer = fs.readFileSync(path.join(root, 'scripts', 'build-installer.mjs'), 'utf8');
if (!installer.includes('cleanSidecarBuildDirs')) {
  errors.push('build-installer.mjs harus memanggil cleanSidecarBuildDirs sebelum electron-builder');
}

const pkgScripts = pkg.scripts ?? {};
for (const bad of ['build:dir', 'build:app:win']) {
  const cmd = String(pkgScripts[bad] ?? '');
  if (cmd.includes('electron-builder') && !cmd.includes('DEPRECATED')) {
    errors.push(`scripts.${bad} masih memanggil electron-builder langsung — pakai build:installer`);
  }
}

const publishJson = path.join(root, 'electron-builder.publish.json');
if (fs.existsSync(publishJson)) {
  const pub = JSON.parse(fs.readFileSync(publishJson, 'utf8'));
  if (!pub.extends || !String(pub.extends).includes('package.json')) {
    errors.push('electron-builder.publish.json harus "extends": "./package.json" agar upload tidak mengabaikan build config');
  }
}

if (errors.length) {
  console.error('[validate-installer-electron-config] GAGAL\n');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('[validate-installer-electron-config] OK');
console.log('  output: release/ | publish config terpisah | sidecar-build dikecualikan & dibersihkan');
