/**
 * Kontrak runtime yang harus tetap benar di installer (QR, skala 3000 grup, post-login sync).
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const scripts = [
  'validate-wa-qr-login-flow.mjs',
  'validate-device-group-scale.mjs',
  'validate-post-login-sync.mjs',
  'validate-telegram-login-flow.mjs',
  'validate-multi-account-wa.mjs',
];

let failed = 0;
console.log('Installer runtime contract checks\n');

for (const script of scripts) {
  const label = script.replace('validate-', '').replace('.mjs', '');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`FAIL  ${label}`);
  } else {
    console.log(`OK    ${label}`);
  }
}

if (failed) {
  console.error(`\n${failed} runtime contract check(s) failed.`);
  process.exit(1);
}
console.log('\nInstaller runtime contract checks passed.');
