/**
 * Publish installer ke GitHub Releases (auto-update).
 * Usage:
 *   node scripts/publish-release.mjs win
 *   node scripts/publish-release.mjs mac
 *   node scripts/publish-release.mjs linux
 *
 * Prasyarat: GH_TOKEN, build selesai (release/*-unpacked atau artefak penuh).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { electronBuilderArgs } from './lib/cross-platform-artifacts.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];

if (!process.env.GH_TOKEN) {
  console.error('ERROR: Set GH_TOKEN (GitHub PAT, scope repo).');
  process.exit(1);
}

if (!target || !['win', 'mac', 'linux'].includes(target)) {
  console.error('Usage: node scripts/publish-release.mjs <win|mac|linux>');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const unpackedDirs = {
  win: path.join(root, 'release', 'win-unpacked'),
  mac: path.join(root, 'release', 'mac'),
  linux: path.join(root, 'release', 'linux-unpacked'),
};

const unpacked = unpackedDirs[target];
if (!fs.existsSync(unpacked)) {
  console.error(`ERROR: ${unpacked} tidak ada. Jalankan npm run build:installer:${target} dulu.`);
  process.exit(1);
}

console.log(`==> Validasi pre-release v${version}`);
const validate = spawnSync('npm', ['run', 'validate:pre-release'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (validate.status !== 0) process.exit(validate.status ?? 1);

const ebFlags = [...electronBuilderArgs(target), '--publish', 'always', '--prepackaged', unpacked];
console.log(`==> Upload GitHub Releases (${ebFlags.join(' ')})`);

const publish = spawnSync('npx', ['electron-builder', ...ebFlags], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (publish.status !== 0) process.exit(publish.status ?? 1);

console.log(`\nSelesai publish ${target} v${version}. Pastikan Release PUBLIC (bukan draft).`);
