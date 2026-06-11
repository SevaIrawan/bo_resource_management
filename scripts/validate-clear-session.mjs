/**
 * Validasi Clear Session — purge lokal + invalidate DB + UI invalid.
 * Jalankan: node scripts/validate-clear-session.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const checks = [
  {
    name: 'clearAccountSession module',
    ok: fs.existsSync(path.join(root, 'src/lib/clearAccountSession.ts')),
  },
  {
    name: 'CLEAR_SESSION_REASON constant',
    ok: read('src/lib/clearAccountSession.ts').includes("export const CLEAR_SESSION_REASON = 'user_cleared'"),
  },
  {
    name: 'purge via prepareDeviceForPlatformLogin',
    ok: read('src/lib/clearAccountSession.ts').includes('prepareDeviceForPlatformLogin'),
  },
  {
    name: 'invalidate DB via invalidatePlatformSessionEverywhere',
    ok: read('src/lib/clearAccountSession.ts').includes('invalidatePlatformSessionEverywhere'),
  },
  {
    name: 'WA purgeWaDisk on clear',
    ok: read('src/lib/clearAccountSession.ts').includes('purgeWaDisk: input.account.platform === \'whatsapp\''),
  },
  {
    name: 'handleClearSession in sync flow',
    ok: read('src/hooks/useAccountSyncFlow.ts').includes('handleClearSession'),
  },
  {
    name: 'Session X button in grid',
    ok:
      read('src/components/group-monitoring/AccountMonitoringCells.tsx').includes('SessionClearButton') &&
      read('src/components/group-monitoring/AccountMonitoringCells.tsx').includes('onClearSession'),
  },
  {
    name: 'Clear only when session valid',
    ok: read('src/components/group-monitoring/AccountMonitoringCells.tsx').includes("row.sessionStatus === 'valid'"),
  },
  {
    name: 'Clear X visible on row/session hover only',
    ok:
      read('src/components/group-monitoring/AccountMonitoringCells.tsx').includes(
        'brand-account-row--clearable-session',
      ) && read('src/index.css').includes('brand-col-cell--session-clearable:hover'),
  },
  {
    name: 'i18n clearSessionAria',
    ok:
      read('src/i18n/locales/en.ts').includes('clearSessionAria') &&
      read('src/i18n/locales/zh.ts').includes('clearSessionAria'),
  },
];

let failed = 0;
for (const c of checks) {
  if (c.ok) {
    console.log(`OK  ${c.name}`);
  } else {
    console.error(`FAIL ${c.name}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log('\nAll clear-session checks passed.');
