/**
 * Siapkan folder release/ sebelum upload GitHub.
 * - Hapus blockmap (unduh penuh, hindari macet diferensial)
 * - sync-release-yml: nama file di yml = nama file di disk (titik vs strip)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.resolve(root, process.argv[2] ?? 'release');

if (!fs.existsSync(releaseDir)) {
  console.error(`ERROR: folder tidak ada: ${releaseDir}`);
  process.exit(1);
}

for (const f of fs.readdirSync(releaseDir).filter((n) => n.endsWith('.blockmap'))) {
  fs.unlinkSync(path.join(releaseDir, f));
  console.log(`Hapus blockmap: ${f}`);
}

const sync = spawnSync(process.execPath, [path.join(root, 'scripts', 'sync-release-yml.mjs'), releaseDir], {
  stdio: 'inherit',
});
if (sync.status !== 0) process.exit(sync.status ?? 1);

console.log('\nSiap upload GitHub.');
