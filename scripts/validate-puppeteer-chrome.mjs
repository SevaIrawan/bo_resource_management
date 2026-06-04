/**
 * Audit: Chrome Puppeteer untuk WhatsApp harus ada sebelum build installer.
 * Usage: node scripts/validate-puppeteer-chrome.mjs [win|mac|linux]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findChromeBinaryUnder } from './lib/cross-platform-artifacts.mjs';
import { parseBuildTargetArg, platformForBuildTarget } from './lib/installer-bundle-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = parseBuildTargetArg(process.argv[2]);
const platform = platformForBuildTarget(target);

const cacheChromeRoot = path.join(root, 'resources', 'puppeteer-cache', 'chrome');
const extraResourcesTarget = 'puppeteer-chrome/chrome';

const devExe = findChromeBinaryUnder(cacheChromeRoot, 0, platform);
const errors = [];

if (!devExe) {
  errors.push(
    `Chrome tidak ditemukan di ${cacheChromeRoot} untuk platform ${platform}\n` +
      '  Jalankan: npm run build:chrome (di runner OS yang sama dengan target installer)',
  );
} else if (platform === 'win32') {
  const chromeWinDir = path.dirname(devExe);
  const siblings = fs.readdirSync(chromeWinDir);
  const hasSupportFiles = siblings.some((n) => n.endsWith('.dll') || n === 'locales');
  if (!hasSupportFiles) {
    errors.push(
      `Folder Chrome Windows tidak lengkap: ${chromeWinDir}\n` +
        '  Puppeteer butuh seluruh folder chrome-win64, bukan satu file saja.',
    );
  }
} else if (platform === 'linux') {
  try {
    fs.accessSync(devExe, fs.constants.X_OK);
  } catch {
    errors.push(`Chrome Linux tidak executable: ${devExe}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const extra = pkg.build?.extraResources?.find(
  (r) => r.to === extraResourcesTarget || r.to?.replace(/\\/g, '/') === extraResourcesTarget,
);
if (!extra) {
  errors.push('package.json build.extraResources tidak memuat puppeteer-chrome/chrome');
} else if (!fs.existsSync(path.join(root, extra.from.replace(/\//g, path.sep)))) {
  errors.push(`extraResources.from tidak ada: ${extra.from}`);
}

const waTs = fs.readFileSync(
  path.join(root, 'electron', 'main', 'platformLogin', 'whatsapp.ts'),
  'utf8',
);
if (!waTs.includes('resolveWaChromeExecutable()')) {
  errors.push('whatsapp.ts tidak memanggil resolveWaChromeExecutable()');
}
if (!waTs.includes('executablePath:')) {
  errors.push('whatsapp.ts tidak set puppeteer.executablePath');
}

if (errors.length) {
  console.error(`[validate-puppeteer-chrome] GAGAL — target ${target}\n`);
  for (const e of errors) console.error(`- ${e}\n`);
  process.exit(1);
}

console.log(`[validate-puppeteer-chrome] OK — target ${target}`);
console.log(`  dev/cache: ${devExe}`);
console.log(`  extraResources: ${extra.from} -> ${extra.to}`);
console.log(`  packaged runtime: %resources%/${extraResourcesTarget}/...`);
