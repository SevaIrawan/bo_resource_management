/**
 * Siapkan folder release/ sebelum upload GitHub — auto-update client lama (1.0.4+).
 * - Hapus *.blockmap (paksa unduh penuh, hindari macet diferensial)
 * - latest-mac.yml harus mengarah ke .zip (bukan .dmg)
 * - Hapus blockMapSize dari latest*.yml
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.resolve(root, process.argv[2] ?? 'release');

if (!fs.existsSync(releaseDir)) {
  console.error(`ERROR: folder tidak ada: ${releaseDir}`);
  process.exit(1);
}

function listFiles(dir, ext) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext));
}

function stripBlockMapLines(ymlText) {
  return ymlText
    .split('\n')
    .filter((line) => !/^\s*blockMapSize:/.test(line))
    .join('\n');
}

function pickMacZip(files) {
  const zips = files.filter((f) => f.endsWith('.zip') && !f.endsWith('.blockmap'));
  const arm = zips.find((f) => /arm64|aarch64/i.test(f));
  return arm ?? zips[0] ?? null;
}

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

function rewriteMacYmlForZip(ymlPath, zipName) {
  let text = fs.readFileSync(ymlPath, 'utf8');
  text = stripBlockMapLines(text);

  if (new RegExp(`path:\\s*${zipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)) {
    fs.writeFileSync(ymlPath, text, 'utf8');
    console.log(`OK: latest-mac.yml sudah pakai ${zipName}`);
    return;
  }

  const zipPath = path.join(releaseDir, zipName);
  if (!fs.existsSync(zipPath)) {
    throw new Error(`ZIP Mac tidak ditemukan: ${zipName}`);
  }
  const stat = fs.statSync(zipPath);
  const sha512 = sha512Base64(zipPath);
  const version = text.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? '0.0.0';
  const releaseDate =
    text.match(/^releaseDate:\s*(.+)$/m)?.[1] ?? `'${new Date().toISOString()}'`;

  const next = `version: ${version}
files:
  - url: ${zipName}
    sha512: ${sha512}
    size: ${stat.size}
path: ${zipName}
sha512: ${sha512}
releaseDate: ${releaseDate}
`;
  fs.writeFileSync(ymlPath, next, 'utf8');
  console.log(`OK: latest-mac.yml → ${zipName} (${stat.size} bytes)`);
}

// 1) Hapus blockmap
for (const f of listFiles(releaseDir, '.blockmap')) {
  fs.unlinkSync(path.join(releaseDir, f));
  console.log(`Hapus blockmap: ${f}`);
}

// 2) Perbaiki latest-mac.yml → zip
const macYml = path.join(releaseDir, 'latest-mac.yml');
if (fs.existsSync(macYml)) {
  const zip = pickMacZip(listFiles(releaseDir, '.zip'));
  if (!zip) {
    console.error('ERROR: tidak ada .zip Mac — build mac harus target dmg+zip');
    process.exit(1);
  }
  rewriteMacYmlForZip(macYml, zip);
}

// 3) Strip blockMapSize dari latest.yml / latest-linux.yml
for (const name of ['latest.yml', 'latest-linux.yml']) {
  const p = path.join(releaseDir, name);
  if (!fs.existsSync(p)) continue;
  const cleaned = stripBlockMapLines(fs.readFileSync(p, 'utf8'));
  fs.writeFileSync(p, cleaned, 'utf8');
  console.log(`OK: ${name} tanpa blockMapSize`);
}

const required = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml'];
for (const name of required) {
  if (!fs.existsSync(path.join(releaseDir, name))) {
    console.error(`ERROR: missing ${name}`);
    process.exit(1);
  }
}

const macText = fs.readFileSync(macYml, 'utf8');
if (/\.dmg\s*$/m.test(macText) && /path:\s*.+\.dmg/.test(macText)) {
  console.error('ERROR: latest-mac.yml masih mengarah ke .dmg');
  process.exit(1);
}

console.log('\nSiap upload GitHub (auto-update: unduh penuh + Mac zip).');
