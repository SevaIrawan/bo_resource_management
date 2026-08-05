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
const loginModalTs = read('src/components/group-monitoring/PlatformLoginModal.tsx');
const syncFlowTs = read('src/hooks/useAccountSyncFlow.ts');
const loginFlowService = read('src/services/loginFlowService.ts');
const scrapeErrorUi = read('src/lib/scrapeErrorUi.ts');
const userActionSession = read('src/lib/userActionSession.ts');

function fnBlock(source, name) {
  const re = new RegExp(`async def ${name}[\\s\\S]*?(?=\\nasync def |\\nexport )`);
  return source.match(re)?.[0] ?? '';
}

const finalizeFn = fnBlock(tgPy, '_finalize_qr_login_if_live');
const statusFn = fnBlock(tgPy, 'get_telegram_status');

const checks = [
  {
    name: 'Sidecar API version bumped bareng (TS + Python) — restart sidecar lama wajib match',
    ok: (() => {
      const tsMatch = sidecarTs.match(/SIDECAR_VERSION\s*=\s*(\d+)/);
      const pyMatch = mainPy.match(/"version":\s*(\d+)/);
      return Boolean(tsMatch && pyMatch && tsMatch[1] === pyMatch[1]);
    })(),
  },
  {
    name: 'Export session serialize-first (Errno 22 soft; AUTH_KEY_DEAD tetap fatal)',
    ok:
      tgPy.includes('_ensure_client_connected') &&
      tgPy.includes('_force_reconnect') &&
      tgPy.includes('serialize LOKAL dulu') &&
      tgPy.includes('session.client.session.save()') &&
      tgPy.includes('_is_auth_key_dead_message') &&
      tgPy.includes('_is_transient_socket_error') &&
      tgPy.includes('ready_despite_transient'),
  },
  {
    name: 'Restore reuse client ready (hindari AUTH_KEY_DUPLICATED dual connect)',
    ok:
      tgPy.includes('restore_reuse') &&
      tgPy.includes('receive_updates=False') &&
      tgPy.includes('_is_auth_key_dead_message') &&
      tgPy.includes('AUTH_KEY_DUPLICATED'),
  },
  {
    name: 'Scrape tidak restore ulang jika session already ready',
    ok: (() => {
      const scrapePy = read('python-sidecar/telegram_scraper.py');
      return (
        scrapePy.includes('need_restore') &&
        scrapePy.includes('session.status != "ready"') &&
        scrapePy.includes('AUTH_KEY_DUPLICATED')
      );
    })(),
  },
  {
    name: 'Validate: AuthKeyDuplicated ≠ SESSION_WARM_PENDING (kode TG_AUTH_KEY_DUPLICATED)',
    ok: (() => {
      const scrapePy = read('python-sidecar/telegram_scraper.py');
      const ui = read('src/lib/scrapeErrorUi.ts');
      return (
        scrapePy.includes('_is_session_warm_pending_message') &&
        scrapePy.includes('TG_AUTH_KEY_DUPLICATED') &&
        scrapePy.includes('_is_auth_key_dead_message(msg)') &&
        !/if "not ready" in lower or "connect" in lower or "timeout" in lower/.test(scrapePy) &&
        ui.includes('isTelegramAuthKeyDeadMessage') &&
        ui.includes('SCRAPER_TG_AUTH_KEY_DUPLICATED') &&
        read('src/i18n/locales/en.ts').includes('tgAuthKeyDuplicated')
      );
    })(),
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
    name: 'Installer: bundled sidecar path (packaged, multi-platform)',
    ok:
      sidecarTs.includes('sidecarBinaryFileName') &&
      sidecarTs.includes('bundledSidecarPath') &&
      sidecarTs.includes('process.resourcesPath'),
  },
  {
    name: 'Auto-update GitHub (electron-updater)',
    ok:
      autoUpdateTs.includes('autoUpdater') &&
      autoUpdateTs.includes('update-downloaded') &&
      indexTs.includes('setupAutoUpdate'),
  },
  {
    name: '2FA / kode login pakai tg_session_lock (hindari race Telethon)',
    ok:
      tgPy.includes('async def submit_telegram_2fa') &&
      /submit_telegram_2fa[\s\S]*?tg_session_lock/.test(tgPy) &&
      /submit_telegram_code[\s\S]*?tg_session_lock/.test(tgPy),
  },
  {
    name: 'Export session pakai tg_session_lock',
    ok: /export_telegram_session[\s\S]*?tg_session_lock/.test(tgPy),
  },
  {
    name: 'Modal: form 2FA disembunyikan saat menyimpan session',
    ok:
      loginModalTs.includes('showSavingPanel') &&
      loginModalTs.includes("view === '2fa' && !showSavingPanel"),
  },
  {
    name: 'Setelah persist login: tutup modal (sync lanjut di baris)',
    ok:
      syncFlowTs.includes('persistSessionAfterLogin') &&
      syncFlowTs.includes("setStep('idle')") &&
      loginFlowService.includes('fetchMasterGroupStatsForAccount'),
  },
  {
    name: 'Session TG mati asli (logout/revoked di HP) → modal Login, bukan notif "busy"',
    ok:
      // Python: klasifikasi exception class (bukan cuma substring pesan generik Telethon).
      tgPy.includes('_is_session_revoked_message') &&
      /_is_session_revoked_message[\s\S]*?authkeyunregistered[\s\S]*?userdeactivated/.test(
        tgPy.toLowerCase(),
      ) &&
      tgPy.includes('TG_SESSION_DEAD:') &&
      /_verify_client_live[\s\S]*?TG_SESSION_DEAD/.test(tgPy) &&
      // JS: TG_SESSION_DEAD wajib dianggap dead SEBELUM dicek busy (urutan menentukan).
      scrapeErrorUi.includes('isTelegramSessionDeadMessage') &&
      /isDeviceBusyMessage[\s\S]*?isTelegramSessionDeadMessage/.test(scrapeErrorUi) &&
      /isDeviceSessionDeadMessage[\s\S]*?isTelegramSessionDeadMessage/.test(scrapeErrorUi) &&
      // userActionSession: device_failed(dead) → login, bukan device_busy generik dari pesan tebakan.
      userActionSession.includes("kind: 'device_busy'") &&
      userActionSession.includes("kind: 'device_failed'"),
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
