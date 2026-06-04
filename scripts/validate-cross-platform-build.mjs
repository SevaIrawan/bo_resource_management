/**
 * Invariant konfigurasi build multi-platform (Win + Mac + Linux).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const pkg = JSON.parse(read('package.json'));
const crossArtifacts = read('scripts/lib/cross-platform-artifacts.mjs');
const sidecarTs = read('electron/main/platformLogin/telegramSidecar.ts');
const build = pkg.build ?? {};
const extra = build.extraResources ?? [];

function hasSidecarExtra(platformKey, binaryName) {
  const section = build[platformKey];
  const list = section?.extraResources ?? [];
  return list.some(
    (e) =>
      String(e.to).includes(`sidecar/${binaryName}`) &&
      String(e.from).includes(binaryName),
  );
}

const checks = [
  {
    name: 'build.mac target dmg + zip (auto-update)',
    ok:
      Array.isArray(build.mac?.target) &&
      build.mac.target.includes('dmg') &&
      build.mac.target.includes('zip'),
  },
  {
    name: 'build.linux target AppImage',
    ok:
      Array.isArray(build.linux?.target) &&
      build.linux.target.includes('AppImage') &&
      !build.linux.target.includes('deb'),
  },
  {
    name: 'Mac entitlements.plist',
    ok: fs.existsSync(path.join(root, 'build', 'entitlements.mac.plist')),
  },
  {
    name: 'sidecarBinaryFileName() di telegramSidecar.ts',
    ok:
      sidecarTs.includes('sidecarBinaryFileName') &&
      sidecarTs.includes('rm-telegram-sidecar.exe') &&
      sidecarTs.includes('rm-telegram-sidecar'),
  },
  {
    name: 'bundledSidecarPath() pakai process.resourcesPath',
    ok: sidecarTs.includes('bundledSidecarPath') && sidecarTs.includes('process.resourcesPath'),
  },
  {
    name: 'Win extraResources: sidecar .exe',
    ok: hasSidecarExtra('win', 'rm-telegram-sidecar.exe'),
  },
  {
    name: 'Mac extraResources: sidecar binary',
    ok: hasSidecarExtra('mac', 'rm-telegram-sidecar'),
  },
  {
    name: 'Linux extraResources: sidecar binary',
    ok: hasSidecarExtra('linux', 'rm-telegram-sidecar'),
  },
  {
    name: 'Skrip build-puppeteer-chrome.mjs',
    ok: fs.existsSync(path.join(root, 'scripts', 'build-puppeteer-chrome.mjs')),
  },
  {
    name: 'Skrip build-telegram-sidecar.mjs',
    ok: fs.existsSync(path.join(root, 'scripts', 'build-telegram-sidecar.mjs')),
  },
  {
    name: 'Skrip build-installer.mjs',
    ok: fs.existsSync(path.join(root, 'scripts', 'build-installer.mjs')),
  },
  {
    name: 'extraResources: env-template.env',
    ok: extra.some((e) => String(e.to).includes('env-template.env')),
  },
  {
    name: 'validate:release-artifact script',
    ok: Boolean(pkg.scripts?.['validate:release-artifact']),
  },
  {
    name: 'npm build:installer:win/mac/linux',
    ok:
      pkg.scripts?.['build:installer:win'] &&
      pkg.scripts?.['build:installer:mac'] &&
      pkg.scripts?.['build:installer:linux'],
  },
  {
    name: 'extraResources shared: puppeteer-chrome',
    ok: (build.extraResources ?? []).some((e) => String(e.to).includes('puppeteer-chrome')),
  },
  {
    name: 'extraResources shared: org-default.env',
    ok: (build.extraResources ?? []).some((e) => String(e.to).includes('org-default.env')),
  },
  {
    name: 'package.json files: exclude sidecar-build/dist',
    ok:
      (build.files ?? []).some((f) => String(f).includes('!resources/sidecar-build')) &&
      (build.files ?? []).some((f) => String(f).includes('!resources/sidecar-dist')),
  },
  {
    name: 'build-installer: bersihkan sidecar-build sebelum pack',
    ok: read('scripts/build-installer.mjs').includes('cleanSidecarBuildDirs'),
  },
  {
    name: 'electronBuilderArgs tanpa --config publish.json',
    ok: (() => {
      const fn = crossArtifacts.match(/export function electronBuilderArgs[\s\S]*?^}/m);
      return Boolean(fn && !fn[0].includes("'--config'") && !fn[0].includes('"--config"'));
    })(),
  },
  {
    name: 'directories.output = release',
    ok: build.directories?.output === 'release',
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} cross-platform build check(s) failed.`);
  process.exit(1);
}
console.log('\nCross-platform build configuration checks passed.');
