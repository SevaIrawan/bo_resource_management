/**
 * Publish installer ke GitHub Releases (auto-update).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runNpm, runProjectTool } from './lib/run-process.mjs';
import { resolvePrepackagedDir } from './lib/installer-bundle-manifest.mjs';

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

const unpacked = resolvePrepackagedDir(root, target);
if (!fs.existsSync(unpacked)) {
  console.error(`ERROR: ${unpacked} tidak ada. Jalankan npm run build:installer:${target} dulu.`);
  process.exit(1);
}

const publishConfig = path.join(root, 'electron-builder.publish.json');
if (!fs.existsSync(publishConfig)) {
  console.error(`ERROR: ${publishConfig} tidak ada.`);
  process.exit(1);
}
const publishCfg = JSON.parse(fs.readFileSync(publishConfig, 'utf8'));
if (!publishCfg.extends || !String(publishCfg.extends).includes('package.json')) {
  console.error('ERROR: electron-builder.publish.json wajib "extends": "./package.json"');
  process.exit(1);
}

console.log(`==> Validasi pre-release v${version}`);
runNpm(root, 'Validasi pre-release', ['run', 'validate:pre-release']);

const platformFlag = target === 'win' ? '--win' : target === 'mac' ? '--mac' : '--linux';
const ebFlags = [
  platformFlag,
  '--config',
  publishConfig,
  '--publish',
  'always',
  '--prepackaged',
  unpacked,
];
console.log(`==> Upload GitHub Releases (${ebFlags.join(' ')})`);

runProjectTool(root, 'electron-builder publish', 'electron-builder/cli.js', ebFlags);

console.log(`\nSelesai publish ${target} v${version}. Pastikan Release PUBLIC (bukan draft).`);
