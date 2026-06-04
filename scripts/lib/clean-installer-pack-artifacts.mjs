/**
 * Hapus artefak yang tidak boleh ikut electron-builder (asar / file scan).
 */
import fs from 'fs';
import path from 'path';

/** @param {string} root */
export function cleanSidecarBuildDirs(root) {
  for (const dir of ['resources/sidecar-build', 'resources/sidecar-dist']) {
    const p = path.join(root, dir);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log(`OK: bersihkan ${dir}`);
    }
  }
}

/** @param {string} root @param {string} version dari package.json */
export function cleanOldReleaseInstallers(root, version) {
  const release = path.join(root, 'release');
  if (!fs.existsSync(release) || !version) return;
  for (const name of fs.readdirSync(release)) {
    if (!/\.(exe|dmg|zip|AppImage)$/i.test(name)) continue;
    if (name.includes(version)) continue;
    const full = path.join(release, name);
    if (!fs.statSync(full).isFile()) continue;
    fs.unlinkSync(full);
    console.log(`OK: hapus installer versi lama ${name}`);
  }
}

/** @param {string} root */
export function cleanStaleNsisArtifacts(root) {
  for (const staleDir of ['release', 'dist']) {
    const dir = path.join(root, staleDir);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (/\.nsis\.7z$/i.test(name) || /\.blockmap$/i.test(name)) {
        fs.unlinkSync(path.join(dir, name));
        console.log(`OK: hapus stale ${staleDir}/${name}`);
      }
    }
  }
}
