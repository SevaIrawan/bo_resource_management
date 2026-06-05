/**
 * Versi rilis konsisten (package.json + PROJECT.md).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const EXPECTED = '1.0.10';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const projectMd = fs.readFileSync(path.join(root, 'PROJECT.md'), 'utf8');

const checks = [
  {
    name: `package.json version = ${EXPECTED}`,
    ok: pkg.version === EXPECTED,
  },
  {
    name: `PROJECT.md menyebut ${EXPECTED}`,
    ok: projectMd.includes(`\`${EXPECTED}\``) || projectMd.includes(EXPECTED),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log(`\nRelease version ${EXPECTED} checks passed.`);
