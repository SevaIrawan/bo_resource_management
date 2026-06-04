/**
 * Audit lengkap setelah build 3 platform — jalankan dari repo (PC dev / IT).
 * Usage: npm run validate:full-build-audit
 *
 * Catatan: validasi binary Chrome/sidecar per OS hanya di host yang sama.
 * Setelah CI hijau, unduh artifacts dan cek validate-release-artifact di runner/OS masing-masing.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hostMatchesTarget } from './lib/installer-bundle-manifest.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const STATIC_VALIDATORS = [
  'validate-session-column-flow.mjs',
  'validate-multi-account-wa.mjs',
  'validate-telegram-login-flow.mjs',
  'validate-wa-qr-login-flow.mjs',
  'validate-electron-runtime-imports.mjs',
  'validate-post-login-sync.mjs',
  'validate-device-group-scale.mjs',
  'validate-refresh-notification.mjs',
  'validate-brand-card-badges.mjs',
  'validate-kpi-five-cards.mjs',
  'validate-release-version.mjs',
  'validate-brand-card-filter.mjs',
  'validate-brand-remove-detail.mjs',
  'validate-ticket-reconcile.mjs',
  'validate-cross-platform-build.mjs',
  'validate-user-permissions.mjs',
  'validate-installer-runtime.mjs',
];

function run(label, args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  const ok = result.status === 0;
  return { label, ok, code: result.status ?? 1, tail: (result.stdout + result.stderr).trim().split('\n').slice(-2).join('\n') };
}

console.log('=== Full build audit — Resource Management ===\n');
console.log(`Host: ${process.platform} | package.json version: ${JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version}\n`);

const results = [];

results.push(run('typecheck', [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit']));

for (const script of STATIC_VALIDATORS) {
  results.push(run(script.replace('.mjs', ''), [path.join(root, 'scripts', script)]));
}

for (const target of ['win', 'mac', 'linux']) {
  results.push(
    run(`installer-package (${target})`, [
      path.join(root, 'scripts', 'validate-installer-package.mjs'),
      target,
    ]),
  );
  if (hostMatchesTarget(target)) {
    results.push(
      run(`puppeteer-chrome (${target})`, [
        path.join(root, 'scripts', 'validate-puppeteer-chrome.mjs'),
        target,
      ]),
    );
  }
}

if (fs.existsSync(path.join(root, 'resources', 'org-default.env')) || fs.existsSync(path.join(root, '.env'))) {
  results.push(run('org-env', [path.join(root, 'scripts', 'validate-org-env.mjs')]));
}

for (const target of ['win', 'mac', 'linux']) {
  if (!hostMatchesTarget(target)) continue;
  const releaseHints = {
    win: 'release/win-unpacked',
    mac: 'release/mac-arm64',
    linux: 'release/linux-unpacked',
  };
  if (fs.existsSync(path.join(root, releaseHints[target]))) {
    results.push(
      run(`release-artifact (${target})`, [
        path.join(root, 'scripts', 'validate-release-artifact.mjs'),
        target,
      ]),
    );
  }
}

let failed = 0;
console.log('--- Hasil ---\n');
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.label}`);
  if (!r.ok) {
    failed += 1;
    if (r.tail) console.log(`      ${r.tail.replace(/\n/g, '\n      ')}`);
  }
}

console.log('\n--- Ringkasan bundel (CI run #6 jika hijau) ---');
console.log('Win : NSIS .exe + win-unpacked/resources (Chrome, sidecar.exe, org-default.env, asarUnpack)');
console.log('Mac : DMG arm64 + mac-arm64/*.app/Contents/Resources');
console.log('Linux: AppImage + linux-unpacked/resources');
console.log('\nClient auto-update: butuh naikkan version + GitHub Release + latest*.yml (GH_TOKEN).');

if (failed) {
  console.error(`\n${failed} check(s) gagal.`);
  process.exit(1);
}
console.log('\nSemua audit lokal lulus.');
