/**
 * Invariant login WA QR — cegah regresi timeout yang mematikan Chrome sebelum QR muncul.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const waTs = fs.readFileSync(
  path.join(root, 'electron/main/platformLogin/whatsapp.ts'),
  'utf8',
);

const deadlineStart = waTs.indexOf('function armQrAppearDeadline');
const deadlineBlock = waTs.slice(
  deadlineStart,
  waTs.indexOf('async function waitForWaLockOrTimeout', deadlineStart),
);

const checks = [
  {
    name: 'QR deadline >= 120s (bundled Chrome)',
    ok: /WA_QR_APPEAR_DEADLINE_MS = 120_000/.test(waTs),
  },
  {
    name: 'Timeout tidak destroyWhatsAppSession (biarkan QR sempat emit)',
    ok:
      deadlineBlock.includes('keeping browser alive') &&
      !deadlineBlock.includes('destroyWhatsAppSession'),
  },
  {
    name: 'Deadline dimulai sebelum initialize (bukan sebelum attach)',
    ok: /armQrAppearDeadline\(sessionId, client, win\);\s*\n\s*await initializeClientWithRetry/.test(
      waTs,
    ),
  },
  {
    name: 'withWaBrowserSlot import benar',
    ok:
      waTs.includes("import { withWaBrowserSlot } from './waBrowserPool'") &&
      !waTs.includes('withWaBrowserPool'),
  },
  {
    name: 'executablePath Chrome terbundel',
    ok: waTs.includes('resolveWaChromeExecutable()'),
  },
  {
    name: 'BrowserWindow runtime import (bukan import type saja)',
    ok:
      /import \{[^}]*BrowserWindow[^}]*\} from 'electron'/.test(waTs) &&
      !waTs.includes("import type { BrowserWindow } from 'electron'") &&
      waTs.includes('BrowserWindow.getAllWindows'),
  },
  {
    name: 'Sync modal skipDiskRestore (AccountMonitoringSyncModals)',
    ok: fs
      .readFileSync(
        path.join(root, 'src/components/group-monitoring/AccountMonitoringSyncModals.tsx'),
        'utf8',
      )
      .includes('attemptRestore={false}'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nAll WA QR login flow checks passed.');
