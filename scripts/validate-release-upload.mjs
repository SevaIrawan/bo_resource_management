/**
 * Sebelum upload GitHub Release: pastikan installer + yml ada dan URL di yml cocok dengan nama file.
 */
import crypto from 'crypto';
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

const files = fs.readdirSync(releaseDir).filter((n) => {
  try {
    return fs.statSync(path.join(releaseDir, n)).isFile();
  } catch {
    return false;
  }
});
const errors = [];

function publicAssetName(localName) {
  if (!/\s/.test(localName)) return localName;
  if (/^Resource Management/i.test(localName)) {
    return localName.replace(/Resource Management/g, 'Resource.Management');
  }
  return localName;
}

function installerBackingFile(ymlPath) {
  if (!ymlPath) return null;
  if (files.includes(ymlPath)) return ymlPath;
  const spaced = ymlPath.replace(/Resource\.Management/g, 'Resource Management');
  if (files.includes(spaced)) return spaced;
  return null;
}

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

function assertYmlMatchesDisk(ymlName) {
  const p = path.join(releaseDir, ymlName);
  if (!fs.existsSync(p)) {
    errors.push(`Missing ${ymlName}`);
    return;
  }
  const text = fs.readFileSync(p, 'utf8');
  const url = text.match(/^path:\s*(.+)$/m)?.[1]?.trim();
  const ymlSha = text.match(/^sha512:\s*(.+)$/m)?.[1]?.trim();
  const fileSizeMatch = text.match(/^\s+size:\s*(\d+)\s*$/m);
  if (!url) {
    errors.push(`${ymlName} tanpa path`);
    return;
  }
  if (!fileSizeMatch) {
    errors.push(`${ymlName} tanpa size di files — electron-updater macet di 0%`);
    return;
  }
  if (/\s/.test(url)) {
    errors.push(`${ymlName} path mengandung spasi — auto-update Win/Mac/Linux akan 404`);
    return;
  }
  if (/^Resource-Management-/i.test(url)) {
    errors.push(`${ymlName} path pakai strip (Resource-Management-) — harus Resource.Management… (titik)`);
    return;
  }
  const backing = installerBackingFile(url);
  if (!backing) {
    errors.push(
      `${ymlName} path "${url}" tidak punya installer di folder (${files.filter((f) => /\.(exe|dmg|zip|AppImage)$/i.test(f)).join(', ')})`,
    );
    return;
  }
  if (url !== publicAssetName(backing)) {
    errors.push(`${ymlName} path harus ${publicAssetName(backing)} (nama publik GitHub), bukan variasi lain`);
  }
  const full = path.join(releaseDir, backing);
  const stat = fs.statSync(full);
  const declaredSize = Number(fileSizeMatch[1]);
  if (declaredSize !== stat.size) {
    errors.push(`${ymlName} size ${declaredSize} ≠ file ${stat.size} bytes`);
  }
  if (ymlSha) {
    const actualSha = sha512Base64(full);
    if (ymlSha !== actualSha) {
      errors.push(`${ymlName} sha512 tidak cocok dengan installer — auto-update gagal checksum`);
    }
  } else {
    errors.push(`${ymlName} tanpa sha512`);
  }
}

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
  assertYmlMatchesDisk(yml);
  const p = path.join(releaseDir, yml);
  if (!fs.existsSync(p)) continue;
  const url = fs.readFileSync(p, 'utf8').match(/^path:\s*(.+)$/m)?.[1]?.trim();
  if (yml === 'latest-mac.yml' && url && /\.exe$/i.test(url)) {
    errors.push(`${yml} mengarah ke .exe — Mac akan salah unduh`);
  }
  if (yml === 'latest-mac.yml' && url && /\.dmg$/i.test(url)) {
    errors.push(`${yml} mengarah ke .dmg — auto-update Mac butuh .zip`);
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
