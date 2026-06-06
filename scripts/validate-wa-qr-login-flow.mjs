/**
 * Invariant login WA QR — cegah regresi timeout yang mematikan Chrome sebelum/saat scan QR.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const waTs = fs.readFileSync(
  path.join(root, 'electron/main/platformLogin/whatsapp.ts'),
  'utf8',
);
const scaleTs = fs.readFileSync(
  path.join(root, 'electron/main/scraper/deviceGroupScale.ts'),
  'utf8',
);
const syncModals = fs.readFileSync(
  path.join(root, 'src/components/group-monitoring/AccountMonitoringSyncModals.tsx'),
  'utf8',
);

const deadlineStart = waTs.indexOf('function armQrAppearDeadline');
const deadlineBlock = waTs.slice(
  deadlineStart,
  waTs.indexOf('async function waitForWaLockOrTimeout', deadlineStart),
);
const loginTimeoutStart = waTs.indexOf('function armWhatsAppLoginTimeout');
const loginTimeoutBlock = waTs.slice(
  loginTimeoutStart,
  waTs.indexOf('function sendWhatsAppLoginError', loginTimeoutStart),
);

const checks = [
  {
    name: 'Timeout QR diskalakan via deviceGroupScale (bukan hardcoded 240s)',
    ok:
      waTs.includes('waQrBootstrapDeadlineMs') &&
      waTs.includes('waQrScanWaitMs') &&
      scaleTs.includes('export function waQrBootstrapDeadlineMs'),
  },
  {
    name: 'Login timeout tidak memanggil stopWhatsAppLogin saat belum CONNECTED',
    ok:
      loginTimeoutBlock.includes('waQrBootstrapDeadlineMs') &&
      loginTimeoutBlock.includes('waQrScanWaitMs') &&
      !loginTimeoutBlock.includes('stopWhatsAppLogin'),
  },
  {
    name: 'WA init retry untuk jaringan lag (3x)',
    ok:
      waTs.includes('NETWORK_RETRY_ATTEMPTS') &&
      waTs.includes('isRetryableNetworkError'),
  },
  {
    name: 'QR appear deadline tidak destroyWhatsAppSession (biarkan QR sempat emit)',
    ok:
      deadlineBlock.includes('keeping browser alive') &&
      !deadlineBlock.includes('destroyWhatsAppSession'),
  },
  {
    name: 'Deadline dimulai sebelum initialize (bukan sebelum attach)',
    ok: /armQrAppearDeadline\(sessionId, client, win, groupEstimate\);\s*\n\s*await initializeClientWithRetry/.test(
      waTs,
    ),
  },
  {
    name: 'groupEstimate diteruskan ke startWhatsAppQrLogin (IPC)',
    ok:
      waTs.includes('groupEstimate?: number') &&
      fs
        .readFileSync(path.join(root, 'electron/main/platformLogin/index.ts'), 'utf8')
        .includes('groupEstimate: payload.groupEstimate'),
  },
  {
    name: 'Login background — modal bisa tutup tanpa unmount hook',
    ok:
      syncModals.includes("'login-background'") &&
      syncModals.includes('keepAlive={step === \'login-background\'}'),
  },
  {
    name: 'withWaBrowserSlot import benar',
    ok:
      waTs.includes("import { withWaBrowserSlot } from './waBrowserPool'") &&
      !waTs.includes('withWaBrowserPool'),
  },
  {
    name: 'Login QR memanggil initializeClientWithRetry dengan win',
    ok: /await initializeClientWithRetry\(sessionId, client, win\)/.test(waTs),
  },
  {
    name: 'Sync modal skipDiskRestore (AccountMonitoringSyncModals)',
    ok: syncModals.includes('attemptRestore={false}'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log(`\n${checks.length}/${checks.length} passed.`);
