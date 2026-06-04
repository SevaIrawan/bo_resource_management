/**
 * Audit: Chrome Puppeteer untuk WhatsApp harus ada sebelum build installer.
 * Meniru resolve path di electron/main/platformLogin/waPuppeteerChrome.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { CHROME_BINARY, findChromeBinaryUnder } from './lib/cross-platform-artifacts.mjs';

const cacheChromeRoot = path.join(root, 'resources', 'puppeteer-cache', 'chrome');
const packagedChromeRoot = path.join(root, 'resources', 'puppeteer-cache', 'chrome');
const extraResourcesTarget = 'puppeteer-chrome/chrome';

const devExe = findChromeBinaryUnder(cacheChromeRoot);
const errors = [];

if (!devExe) {
  errors.push(
    `${CHROME_BINARY} tidak ditemukan di ${cacheChromeRoot}\n` +
      '  Jalankan: npm run build:chrome',
  );
} else {
  const chromeWinDir = path.dirname(devExe);
  const siblings = fs.readdirSync(chromeWinDir);
  const hasSupportFiles = siblings.some((n) => n.endsWith('.dll') || n === 'locales');
  if (process.platform === 'win32' && !hasSupportFiles) {
    errors.push(
      `Folder Chrome tidak lengkap (hanya chrome.exe?): ${chromeWinDir}\n` +
        '  Puppeteer butuh seluruh folder chrome-win64, bukan satu file saja.',
    );
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
  console.error('[validate-puppeteer-chrome] GAGAL\n');
  for (const e of errors) console.error(`- ${e}\n`);
  process.exit(1);
}

console.log('[validate-puppeteer-chrome] OK');
console.log(`  dev/cache: ${devExe}`);
console.log(`  extraResources: ${extra.from} -> ${extra.to}`);
console.log(`  packaged runtime: %resources%/${extraResourcesTarget}/.../${CHROME_BINARY}`);
