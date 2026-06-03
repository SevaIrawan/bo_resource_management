/**
 * Invariant multi-akun WA (Electron main).
 * Jalankan: node scripts/validate-multi-account-wa.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const waTs = fs.readFileSync(
  path.join(root, 'electron/main/platformLogin/whatsapp.ts'),
  'utf8',
);
const poolTs = fs.readFileSync(
  path.join(root, 'electron/main/platformLogin/waBrowserPool.ts'),
  'utf8',
);

const checks = [
  {
    name: 'LocalAuth clientId per session',
    ok: waTs.includes('clientId: sessionId') && waTs.includes('dataPath: waSessionsRoot()'),
  },
  {
    name: 'Lock per sessionId (bukan global satu lock)',
    ok: waTs.includes('withWaSessionLock') && waTs.includes('sessionLocks'),
  },
  {
    name: 'Login await initialize (no void overlap)',
    ok:
      !waTs.includes('void initializeClientWithRetry') &&
      waTs.includes('await initializeClientWithRetry(sessionId, client)'),
  },
  {
    name: 'forceRelease does not delete sessionLocks',
    ok: !/forceReleaseWhatsAppForLogin[\s\S]*?sessionLocks\.delete/.test(waTs),
  },
  {
    name: 'Global browser pool for initialize',
    ok: waTs.includes('withWaBrowserSlot') && poolTs.includes('RM_WA_MAX_CONCURRENT_BROWSERS'),
  },
  {
    name: 'withWaBrowserSlot import (bukan typo withWaBrowserPool)',
    ok:
      waTs.includes("import { withWaBrowserSlot } from './waBrowserPool'") &&
      !waTs.includes('withWaBrowserPool') &&
      poolTs.includes('export async function withWaBrowserSlot'),
  },
  {
    name: 'Puppeteer executablePath terbundel',
    ok:
      waTs.includes('resolveWaChromeExecutable()') &&
      fs.existsSync(path.join(root, 'electron/main/platformLogin/waPuppeteerChrome.ts')),
  },
  {
    name: 'Renderer resolves device session id',
    ok: fs.existsSync(path.join(root, 'src/lib/deviceSessionId.ts')),
  },
];

let failed = 0;
for (const c of checks) {
  const mark = c.ok ? 'OK' : 'FAIL';
  console.log(`${mark}  ${c.name}`);
  if (!c.ok) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll multi-account WA invariants passed.');
