/**
 * Sebelum upload GitHub Release: pastikan installer + yml ada dan URL di yml cocok dengan nama file.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const releaseDir = path.resolve(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  process.argv[2] ?? 'release',
);

if (!fs.existsSync(releaseDir)) {
  console.error(`ERROR: ${releaseDir} tidak ada`);
  process.exit(1);
}

const files = fs.readdirSync(releaseDir);
const errors = [];

function mustExist(predicate, label) {
  const hit = files.find(predicate);
  if (!hit) errors.push(`Tidak ada: ${label}`);
  return hit;
}

const exe = mustExist((n) => /\.exe$/i.test(n) && /Setup/i.test(n), 'Windows Setup .exe');
const dmg = mustExist((n) => /\.dmg$/i.test(n) && /arm64/i.test(n), 'Mac arm64 .dmg');
const zip = mustExist((n) => /\.zip$/i.test(n) && /arm64/i.test(n), 'Mac arm64 .zip (auto-update)');
const appImage = mustExist((n) => /\.AppImage$/i.test(n), 'Linux .AppImage');

for (const yml of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']) {
  const p = path.join(releaseDir, yml);
  if (!fs.existsSync(p)) {
    errors.push(`Missing ${yml}`);
    continue;
  }
  const text = fs.readFileSync(p, 'utf8');
  const pathMatch = text.match(/^path:\s*(.+)$/m);
  const url = pathMatch?.[1]?.trim();
  if (!url || !files.includes(url)) {
    errors.push(`${yml} path "${url}" tidak cocok dengan file di folder: ${files.join(', ')}`);
  }
  if (yml === 'latest-mac.yml' && url && /\.exe$/i.test(url)) {
    errors.push(`${yml} mengarah ke .exe — Mac akan salah unduh`);
  }
}

if (errors.length) {
  console.error('[validate-release-upload] GAGAL\n');
  for (const e of errors) console.error(' -', e);
  console.error('\nFiles:', files.join('\n  '));
  process.exit(1);
}

console.log('[validate-release-upload] OK');
console.log('  Win:', exe);
console.log('  Mac dmg:', dmg);
console.log('  Mac zip:', zip);
console.log('  Linux:', appImage);
