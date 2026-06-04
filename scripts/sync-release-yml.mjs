/**
 * Samakan latest*.yml dengan nama file installer yang benar-benar ada di release/.
 * GitHub Releases URL harus sama persis dengan nama file (titik vs spasi vs strip).
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

const names = fs.readdirSync(releaseDir).filter((n) => {
  try {
    return fs.statSync(path.join(releaseDir, n)).isFile();
  } catch {
    return false;
  }
});

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

/** Prefer nama file GitHub (Resource.Management…) bukan spasi/strip dari yml lama electron-builder. */
function pickBest(candidates, prefer) {
  if (!candidates.length) return null;
  for (const test of prefer) {
    const hit = candidates.find(test);
    if (hit) return hit;
  }
  return candidates[0];
}

/** Nama di GitHub Releases (titik) — yml harus sama persis atau electron-updater 404 di semua OS. */
function publicAssetName(localName) {
  if (!/\s/.test(localName)) return localName;
  if (/^Resource Management/i.test(localName)) {
    return localName.replace(/Resource Management/g, 'Resource.Management');
  }
  return localName;
}

function resolveOnDisk(preferred) {
  if (preferred && fs.existsSync(path.join(releaseDir, preferred))) return preferred;
  const dotted = preferred ? publicAssetName(preferred) : null;
  if (dotted && fs.existsSync(path.join(releaseDir, dotted))) return dotted;
  return preferred;
}

function writeYml(fileName, installerName, version) {
  const onDisk = resolveOnDisk(installerName);
  const full = path.join(releaseDir, onDisk);
  if (!fs.existsSync(full)) {
    console.error(`ERROR: ${installerName} tidak ada di ${releaseDir}`);
    process.exit(1);
  }
  const publishName = publicAssetName(onDisk);
  const stat = fs.statSync(full);
  const sha512 = sha512Base64(full);
  const yml = `version: ${version}
files:
  - url: ${publishName}
    sha512: ${sha512}
    size: ${stat.size}
path: ${publishName}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`;
  fs.writeFileSync(path.join(releaseDir, fileName), yml, 'utf8');
  console.log(`OK: ${fileName} → ${publishName} (file: ${onDisk})`);
}

const winCandidates = names.filter((n) => /\.exe$/i.test(n) && /Setup/i.test(n));
const macZipCandidates = names.filter((n) => /\.zip$/i.test(n) && /arm64/i.test(n));
const macDmgCandidates = names.filter((n) => /\.dmg$/i.test(n) && /arm64/i.test(n));
const linuxCandidates = names.filter((n) => /\.AppImage$/i.test(n));

const winExe = pickBest(
  winCandidates.filter((n) => !/^Resource-Management-/i.test(n)),
  [
    (n) => /^Resource\.Management\.Setup\./i.test(n),
    (n) => /^Resource\.Management/i.test(n) && !/\s/.test(n),
  ],
);
const macZip = pickBest(macZipCandidates, [
  (n) => /^Resource\.Management-.*arm64.*\.zip$/i.test(n),
  (n) => /\.zip$/i.test(n) && !/\s/.test(n),
]);
const macDmg = pickBest(macDmgCandidates, [
  (n) => /^Resource\.Management-.*arm64.*\.dmg$/i.test(n),
  (n) => /\.dmg$/i.test(n) && !/\s/.test(n),
]);
const linuxImg = pickBest(linuxCandidates, [
  (n) => /^Resource\.Management-.*\.AppImage$/i.test(n),
  (n) => /\.AppImage$/i.test(n) && !/\s/.test(n),
]);

if (!winExe || (!macZip && !macDmg) || !linuxImg) {
  console.error('ERROR: installer tidak lengkap di', releaseDir);
  console.error({ winExe, macZip, macDmg, linuxImg, files: names });
  process.exit(1);
}

const version =
  winExe.match(/(\d+\.\d+\.\d+)/)?.[1] ??
  macZip?.match(/(\d+\.\d+\.\d+)/)?.[1] ??
  '0.0.0';

const macInstaller = macZip ?? macDmg;
if (!macZip) {
  console.warn(
    'PERINGATAN: tidak ada .zip Mac — auto-update butuh zip; .dmg hanya install manual.',
  );
}

writeYml('latest.yml', winExe, version);
writeYml('latest-mac.yml', macInstaller, version);
writeYml('latest-linux.yml', linuxImg, version);
