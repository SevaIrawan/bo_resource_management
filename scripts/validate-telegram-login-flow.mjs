/**
 * Invariant login Telegram QR (sidecar + Electron poll).
 * Mencegah regresi: scan HP sukses tapi UI error 500 / JSON parse.
 * Jalankan: node scripts/validate-telegram-login-flow.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const tgPy = read('python-sidecar/telegram_login.py');
const mainPy = read('python-sidecar/main.py');
const sidecarTs = read('electron/main/platformLogin/telegramSidecar.ts');
const appEnvTs = read('electron/main/appEnv.ts');
const autoUpdateTs = read('electron/main/autoUpdate.ts');
const indexTs = read('electron/main/index.ts');
const loginTs = read('src/hooks/usePlatformLogin.ts');

function fnBlock(source, name) {
  const re = new RegExp(`async def ${name}[\\s\\S]*?(?=\\nasync def |\\nexport )`);
  return source.match(re)?.[0] ?? '';
}

const finalizeFn = fnBlock(tgPy, '_finalize_qr_login_if_live');
const statusFn = fnBlock(tgPy, 'get_telegram_status');

const checks = [
  {
    name: 'Sidecar API version 3 (restart sidecar lama)',
    ok: sidecarTs.includes('SIDECAR_VERSION = 3') && mainPy.includes('"version": 3'),
  },
  {
    name: 'Finalize QR tidak cancel wait_task',
    ok: finalizeFn.includes('jangan cancel wait_task') && !finalizeFn.includes('wait_task.cancel'),
  },
  {
    name: 'Poll status tanpa lock penuh get_telegram_status',
    ok: statusFn.includes('Poll ringan') && !statusFn.includes('tg_session_lock'),
  },
  {
    name: 'Poll tanpa session aktif → pending (grace, bukan stop poll)',
    ok: /if not session:\s*\n\s*return \{"status": "pending"/.test(tgPy),
  },
  {
    name: 'wait_task recovery setelah scan (is_user_authorized)',
    ok: /_wait_for_qr_scan[\s\S]*?is_user_authorized/.test(tgPy),
  },
  {
    name: 'FastAPI global exception → JSON (bukan plain 500)',
    ok: mainPy.includes('unhandled_exception_handler') && mainPy.includes('status_code=200'),
  },
  {
    name: 'Electron parseSidecarJson (bukan res.json mentah di poll)',
    ok: sidecarTs.includes('parseSidecarJson') && sidecarTs.includes('POLL_ERROR_MAX_STREAK'),
  },
  {
    name: 'Poll retry untuk Internal Server Error',
    ok: sidecarTs.includes('isRetryableTelegramPollError'),
  },
  {
    name: 'UI tidak timpa ready dengan error sidecar sementara',
    ok:
      loginTs.includes('loginSucceededRef.current') &&
      loginTs.includes('internal server error'),
  },
  {
    name: 'Sidecar spawn memuat .env via loadAppEnv + RM_ENV_FILE',
    ok:
      sidecarTs.includes('sidecarEnv') &&
      sidecarTs.includes('loadAppEnv') &&
      sidecarTs.includes('RM_ENV_FILE') &&
      appEnvTs.includes('TELEGRAM_API_ID') &&
      appEnvTs.includes('dotenv'),
  },
  {
    name: 'Python sidecar baca RM_ENV_FILE',
    ok: mainPy.includes('RM_ENV_FILE') && mainPy.includes('load_dotenv'),
  },
  {
    name: 'Installer: bundled sidecar exe path (packaged)',
    ok:
      sidecarTs.includes('rm-telegram-sidecar.exe') &&
      sidecarTs.includes('process.resourcesPath'),
  },
  {
    name: 'Auto-update GitHub (electron-updater)',
    ok:
      autoUpdateTs.includes('autoUpdater') &&
      autoUpdateTs.includes('update-downloaded') &&
      indexTs.includes('setupAutoUpdate'),
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
console.log('\nAll Telegram QR login invariants passed.');
