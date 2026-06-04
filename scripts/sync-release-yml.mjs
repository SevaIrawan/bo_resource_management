/**
 * Samakan latest*.yml dengan nama file installer yang benar-benar ada di release/.
 * electron-builder kadang menulis URL pakai strip (Resource-Management-…) sedangkan
 * file di disk/GitHub pakai titik (Resource.Management.…).
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

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

function pickFile(patterns) {
  const names = fs.readdirSync(releaseDir);
  for (const test of patterns) {
    const hit = names.find(test);
    if (hit) return hit;
  }
  return null;
}

function writeYml(fileName, installerName, version, releaseDate) {
  const full = path.join(releaseDir, installerName);
  const stat = fs.statSync(full);
  const sha512 = sha512Base64(full);
  const date = releaseDate ?? `'${new Date().toISOString()}'`;
  const yml = `version: ${version}
files:
  - url: ${installerName}
    sha512: ${sha512}
    size: ${stat.size}
path: ${installerName}
sha512: ${sha512}
releaseDate: ${date}
`;
  fs.writeFileSync(path.join(releaseDir, fileName), yml, 'utf8');
  console.log(`OK: ${fileName} → ${installerName}`);
}

const winExe = pickFile([
  (n) => /\.exe$/i.test(n) && /Setup/i.test(n),
  (n) => /\.exe$/i.test(n),
]);
const macZip = pickFile([
  (n) => /\.zip$/i.test(n) && /arm64/i.test(n),
  (n) => /\.zip$/i.test(n),
]);
const macDmg = pickFile([
  (n) => /\.dmg$/i.test(n) && /arm64/i.test(n),
  (n) => /\.dmg$/i.test(n),
]);
const linuxImg = pickFile([(n) => /\.AppImage$/i.test(n)]);

if (!winExe || (!macZip && !macDmg) || !linuxImg) {
  console.error('ERROR: installer tidak lengkap di', releaseDir);
  console.error({ winExe, macZip, macDmg, linuxImg, files: fs.readdirSync(releaseDir) });
  process.exit(1);
}

const version =
  winExe.match(/(\d+\.\d+\.\d+)/)?.[1] ??
  macZip?.match(/(\d+\.\d+\.\d+)/)?.[1] ??
  '0.0.0';

const macInstaller = macZip ?? macDmg;
if (!macZip) {
  console.warn(
    'PERINGATAN: tidak ada .zip Mac — auto-update Squirrel butuh zip; .dmg hanya untuk install manual.',
  );
}

writeYml('latest.yml', winExe, version);
writeYml('latest-mac.yml', macInstaller, version);
writeYml('latest-linux.yml', linuxImg, version);
