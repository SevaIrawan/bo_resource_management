import type { Platform } from '@/types/database';
import { PHONE_COLUMN_MIGRATION_HINT } from '@/lib/dbPhoneSchema';
import { PLATFORM_SESSION_RLS_HINT } from '@/lib/platformSessions';
import {
  isWaLinkLoadingProbeMessage,
  isWaUnlinkedProbeMessage,
} from '@/lib/waLinkStatus';

/** Kode modal scrape — dipetakan ke i18n di AccountMonitoringSyncModals. */
export type ScrapeErrorModalCode =
  | 'SCRAPER_CANCELLED'
  | 'SCRAPER_WA_DISCONNECTED'
  | 'SCRAPER_WA_CONNECT_FAILED'
  | 'SCRAPER_WA_SESSION_UNLINKED'
  | 'SCRAPER_TG_CONNECT_FAILED'
  | 'SCRAPER_TG_AUTH_KEY_DUPLICATED'
  | 'SCRAPER_INCOMPLETE'
  | 'SCRAPER_TRUNCATED_CAP'
  | 'SCRAPER_ROLES_UNVERIFIED'
  | 'SCRAPER_CONNECTION_LOST'
  | 'SCRAPER_NETWORK_ERROR'
  | 'SCRAPER_IDLE_STUCK'
  | 'SCRAPER_WA_SYNC_PENDING'
  | 'SCRAPER_LEGACY_TIMEOUT';

export const SCRAPE_CONNECTION_MODAL_CODES: ReadonlySet<ScrapeErrorModalCode> = new Set([
  'SCRAPER_WA_DISCONNECTED',
  'SCRAPER_WA_CONNECT_FAILED',
  'SCRAPER_TG_CONNECT_FAILED',
  'SCRAPER_TG_AUTH_KEY_DUPLICATED',
  'SCRAPER_INCOMPLETE',
  'SCRAPER_TRUNCATED_CAP',
  'SCRAPER_ROLES_UNVERIFIED',
  'SCRAPER_CONNECTION_LOST',
  'SCRAPER_NETWORK_ERROR',
  'SCRAPER_IDLE_STUCK',
  'SCRAPER_WA_SYNC_PENDING',
  'SCRAPER_LEGACY_TIMEOUT',
]);

export function isScrapeConnectionModalCode(
  code: string | null | undefined,
): code is ScrapeErrorModalCode {
  return (
    typeof code === 'string' &&
    SCRAPE_CONNECTION_MODAL_CODES.has(code as ScrapeErrorModalCode)
  );
}

/** Bersihkan bungkus IPC Electron `Error invoking remote method 'scraper:…'. */
export function normalizeScrapeErrorMessage(message: string): string {
  const trimmed = message.trim();
  const invokeMatch = trimmed.match(
    /Error invoking remote method 'scraper:(?:run(?:-auto)?|export-telegram-session|restore-telegram-session)':\s*(?:Error:\s*)?([\s\S]+)/i,
  );
  if (invokeMatch?.[1]) return invokeMatch[1].trim();
  return trimmed;
}

/**
 * Telegram StringSession mati karena dipakai 2 IP/PC sekaligus (AuthKeyDuplicated).
 * Portable session — wajib login QR ulang; jangan treat sebagai SESSION_WARM_PENDING.
 */
export function isTelegramAuthKeyDeadMessage(message: string | undefined): boolean {
  if (!message) return false;
  const lower = normalizeScrapeErrorMessage(message).toLowerCase();
  return (
    lower.includes('tg_auth_key_duplicated') ||
    lower.includes('scraper_tg_auth_key_duplicated') ||
    lower.includes('auth_key_duplicated') ||
    lower.includes('authkeyduplicated') ||
    (lower.includes('authorization key') && lower.includes('no longer be used')) ||
    lower.includes('two different ip')
  );
}

/** Client WA masih nyala / sync / timeout — bukan unlink di HP. */
/**
 * Session TG logout/revoked ASLI di device (bukan konflik AUTH_KEY_DUPLICATED, bukan busy).
 * Sidecar menandai dengan prefix `TG_SESSION_DEAD:` (lihat `_verify_client_live` /
 * `validate_telegram_session`) — jangan tebak keyword bebas, pesan Telethon
 * (AuthKeyUnregistered/UserDeactivated/SessionRevoked) sering generik dan bisa memuat kata
 * seperti "timeout"/"connect" yang salah kena filter busy/transient.
 */
export function isTelegramSessionDeadMessage(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.startsWith('tg_session_dead:') ||
    lower.includes('tg_session_dead:') ||
    lower.includes('auth_key_unregistered') ||
    lower.includes('authkeyunregistered') ||
    lower.includes('user_deactivated') ||
    lower.includes('userdeactivated') ||
    lower.includes('session_revoked') ||
    lower.includes('sessionrevoked') ||
    lower.includes('key is not registered in the system') ||
    lower.includes('telegram session is not valid')
  );
}

export function isDeviceBusyMessage(message: string | undefined): boolean {
  if (!message) return false;
  // Auth key mati sering kebungkus SESSION_WARM_PENDING (bug lama) — jangan anggap busy.
  if (isTelegramAuthKeyDeadMessage(message)) return false;
  if (isTelegramSessionDeadMessage(message)) return false;
  if (
    message === 'SESSION_SETTLING' ||
    message === 'SCRAPER_GLOBAL_BUSY' ||
    message === 'JOB_QUEUE_EXECUTE_FULL'
  ) {
    return true;
  }
  if (isWaLinkLoadingProbeMessage(message)) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('browser is already running') ||
    lower.includes('still starting from a previous attempt') ||
    lower.includes('session_warm_pending') ||
    // Windows/Telethon soft socket — retry Sync, bukan modal "restart app".
    lower.includes('errno 22') ||
    lower.includes('winerror 10022') ||
    lower.includes('invalid argument') ||
    lower.includes('session check timed out') ||
    lower.includes('session_check_timeout') ||
    (lower.includes('timed out') && lower.includes('restore device session'))
  );
}

/** Unlink di HP (UNPAIRED / logout) — DB + UI invalid. */
export function isDeviceSessionDeadMessage(message: string | undefined): boolean {
  if (!message) return false;
  if (isTelegramAuthKeyDeadMessage(message)) return true;
  if (isTelegramSessionDeadMessage(message)) return true;
  if (isDeviceBusyMessage(message)) return false;
  if (isWaUnlinkedProbeMessage(message)) return true;
  return scrapeFailureNeedsLoginModal(message);
}

export function scrapeFailureNeedsLoginModal(message: string): boolean {
  if (isTelegramAuthKeyDeadMessage(message)) return true;
  if (isTelegramSessionDeadMessage(message)) return true;
  if (isDeviceBusyMessage(message)) return false;
  if (isWaChromeConnectFailedMessage(message)) return false;
  if (isTgSidecarConnectFailedMessage(message)) return false;
  const lower = normalizeScrapeErrorMessage(message).toLowerCase();

  return (
    lower === 'scraper_wa_session_unlinked' ||
    lower.startsWith('scraper_wa_session_unlinked') ||
    lower.includes('wa_not_connected') ||
    lower.includes('auth_failure') ||
    lower === 'logout' ||
    lower.includes('logout') ||
    lower.includes('logged out') ||
    lower.includes('log out') ||
    lower.includes('unpaired') ||
    lower.includes('unlink') ||
    lower.includes('session invalid') ||
    lower.includes('device_not_connected') ||
    lower.includes('login session not found') ||
    lower.includes('complete login first') ||
    (lower.includes('log in first') && !lower.includes('session_warm_pending')) ||
    lower.includes('session is not authorized') ||
    (lower.includes('wa_client_not_ready') && lower.includes('lost'))
  );
}

/**
 * Sidecar TG / fetch ke localhost gagal atau AbortSignal timeout —
 * bukan logout akun; coba lagi / restart app.
 * Errno 22 / WinError 10022 = soft socket → isDeviceBusyMessage (bukan di sini).
 */
export function isTgSidecarConnectFailedMessage(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = normalizeScrapeErrorMessage(message);
  const lower = normalized.toLowerCase();
  if (lower === 'scraper_tg_connect_failed' || lower.startsWith('scraper_tg_connect_failed')) {
    return true;
  }
  if (lower.includes('typeerror') && lower.includes('fetch failed')) return true;
  if (lower === 'fetch failed' || lower.includes('fetch failed')) return true;
  if (lower.includes('failed to fetch')) return true;
  if (lower.includes('econnrefused') || lower.includes('econnreset')) return true;
  if (lower.includes('operation was aborted due to timeout')) return true;
  if (lower.startsWith('timeouterror') || lower.includes('timeouterror:')) return true;
  if (lower.includes('aborted due to timeout')) return true;
  if (lower.includes('telegram scrape http')) return true;
  if (lower.includes('failed to restore telegram session')) return true;
  if (lower.includes('failed to export telegram session')) return true;
  if (lower.includes('sidecar') && (lower.includes('fail') || lower.includes('timeout'))) {
    return true;
  }
  return false;
}

/**
 * Chrome/WA Web gagal connect/retry setelah session sudah Valid —
 * bukan unlink di HP; bukan suruh scan QR.
 */
export function isWaChromeConnectFailedMessage(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = normalizeScrapeErrorMessage(message);
  const lower = normalized.toLowerCase();
  if (lower === 'scraper_wa_connect_failed' || lower.startsWith('scraper_wa_connect_failed')) {
    return true;
  }
  if (lower.includes('whatsapp session timed out') && lower.includes('linked devices')) {
    return true;
  }
  if (lower.includes('session timed out') && lower.includes('qr or phone')) {
    return true;
  }
  if (lower.includes('wa session check failed')) return true;
  if (lower.includes('browser is already running')) return true;
  if (lower.includes('still starting from a previous attempt')) return true;
  if (lower.includes('failed to launch') && lower.includes('chrome')) return true;
  if (lower.includes('failed to launch the browser')) return true;
  if (lower.includes('callfunctionon timed out') || lower.includes('protocolerror')) {
    return true;
  }
  if (lower.includes('detached frame') || lower.includes('execution context was destroyed')) {
    return true;
  }
  return false;
}

/** Hanya batal eksplisit operator — bukan putus koneksi browser/WA. */
export function isScrapeUserCancelledMessage(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = normalizeScrapeErrorMessage(message);
  return (
    normalized === 'SCRAPER_CANCELLED' ||
    normalized.includes('SCRAPER_CANCELLED')
  );
}

/**
 * Koneksi ke server/platform terputus di luar pengaturan idle app.
 * Fakta: pesan dari WA_NOT_CONNECTED, Puppeteer disconnect, jaringan.
 */
export function isScrapeConnectionLostMessage(message: string | undefined): boolean {
  if (!message || isScrapeUserCancelledMessage(message)) return false;
  const lower = normalizeScrapeErrorMessage(message).toLowerCase();

  if (lower.startsWith('scraper_wa_disconnected')) return true;
  if (lower.startsWith('scraper_connection_lost')) return true;
  if (lower.includes('wa_not_connected')) return true;
  if (lower.includes('wa_client_not_ready') && lower.includes('lost')) return true;
  if (lower.includes('browser has disconnected')) return true;
  if (lower.includes('target closed')) return true;
  if (lower.includes('session closed')) return true;
  if (lower.includes('connection closed')) return true;
  if (lower.includes('navigation failed')) return true;
  if (lower.includes('net::err_')) return true;
  if (lower.includes('econnreset') || lower.includes('econnrefused') || lower.includes('enotfound')) {
    return true;
  }
  if (lower.includes('protocol error') && !lower.includes('no progress')) return true;

  return false;
}

export function isScrapeNetworkErrorMessage(message: string | undefined): boolean {
  if (!message) return false;
  const lower = normalizeScrapeErrorMessage(message).toLowerCase();
  return (
    lower.startsWith('scraper_network_error') ||
    lower.includes('fetch failed') ||
    lower.includes('network request failed') ||
    lower.includes('failed to fetch')
  );
}

export function isScrapeIdleStuckMessage(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = normalizeScrapeErrorMessage(message);
  const lower = normalized.toLowerCase();
  return (
    lower.startsWith('scraper_idle_stuck') ||
    (lower.includes('no progress for') && lower.includes('scrape'))
  );
}

/** @deprecated Pakai isScrapeUserCancelledMessage / isScrapeConnectionLostMessage. */
export function isScrapeAbortMessage(message: string | undefined): boolean {
  if (isScrapeUserCancelledMessage(message)) return true;
  if (isScrapeConnectionLostMessage(message)) return false;
  if (!message) return false;
  const lower = normalizeScrapeErrorMessage(message).toLowerCase();
  return (
    lower.includes("reading 'getchat'") ||
    lower.includes('wa_store_evaluate_failed')
  );
}

/** Petakan pesan error scrape → kode modal (i18n). Null = tampilkan teks mentah. */
export function resolveScrapeErrorModalCode(message: string): ScrapeErrorModalCode | null {
  const normalized = normalizeScrapeErrorMessage(message);
  const lower = normalized.toLowerCase();

  if (isScrapeUserCancelledMessage(normalized)) return 'SCRAPER_CANCELLED';

  if (isTelegramAuthKeyDeadMessage(normalized)) {
    return 'SCRAPER_TG_AUTH_KEY_DUPLICATED';
  }

  if (
    lower === 'scraper_wa_session_unlinked' ||
    lower.startsWith('scraper_wa_session_unlinked') ||
    lower === 'logout' ||
    lower === 'unpaired'
  ) {
    return 'SCRAPER_WA_SESSION_UNLINKED';
  }

  if (isTgSidecarConnectFailedMessage(normalized)) return 'SCRAPER_TG_CONNECT_FAILED';

  if (isWaChromeConnectFailedMessage(normalized)) return 'SCRAPER_WA_CONNECT_FAILED';

  if (
    lower.startsWith('scraper_incomplete') ||
    lower.includes('wa_store_undercount') ||
    lower.includes('inbox not fully synced')
  ) {
    return 'SCRAPER_INCOMPLETE';
  }

  if (
    lower.startsWith('scraper_truncated_cap') ||
    lower.includes('truncated_6000') ||
    /truncated_\d+/.test(lower)
  ) {
    return 'SCRAPER_TRUNCATED_CAP';
  }

  if (
    lower.startsWith('scraper_roles_unverified') ||
    /unverified_roles_\d+/.test(lower)
  ) {
    return 'SCRAPER_ROLES_UNVERIFIED';
  }

  if (lower.startsWith('scraper_idle_stuck') || isScrapeIdleStuckMessage(normalized)) {
    return 'SCRAPER_IDLE_STUCK';
  }

  if (lower.includes('wa_store_not_ready')) return 'SCRAPER_WA_SYNC_PENDING';

  if (
    lower.includes('scrapetimeouterror') &&
    lower.includes('timed out after') &&
    !lower.includes('no progress')
  ) {
    return 'SCRAPER_LEGACY_TIMEOUT';
  }

  if (lower.includes('wa_not_connected') || lower.startsWith('scraper_wa_disconnected')) {
    return 'SCRAPER_WA_DISCONNECTED';
  }

  if (isScrapeNetworkErrorMessage(normalized)) return 'SCRAPER_NETWORK_ERROR';

  if (isScrapeConnectionLostMessage(normalized)) return 'SCRAPER_CONNECTION_LOST';

  return null;
}

/** Teks modal — jangan tampilkan LOGOUT mentah; kode pendek → i18n. */
export function formatScrapeErrorForModal(message: string): string {
  const normalized = normalizeScrapeErrorMessage(message).trim();
  if (!normalized) return '';

  if (normalized.startsWith('SCRAPER_IDLE_STUCK:')) {
    return normalized.slice('SCRAPER_IDLE_STUCK:'.length).trim();
  }
  if (normalized.startsWith('SCRAPER_INCOMPLETE:')) {
    return normalized.slice('SCRAPER_INCOMPLETE:'.length).trim();
  }

  const upper = normalized.toUpperCase();
  if (
    upper === 'LOGOUT' ||
    upper === 'LOG OUT' ||
    upper === 'UNPAIRED' ||
    upper === 'SCRAPER_WA_SESSION_UNLINKED'
  ) {
    return 'SCRAPER_WA_SESSION_UNLINKED';
  }

  return normalized;
}

/** Kode pendek tanpa detail — boleh pakai i18n fallback. */
export function isScrapeErrorCodeOnly(message: string): boolean {
  const n = formatScrapeErrorForModal(message);
  return /^(SCRAPER_[A-Z_]+|SCRAPER_FAILED|SYNC_FAILED)$/i.test(n);
}

const ROLES_UNVERIFIED_COUNTS_RE = /SCRAPER_ROLES_UNVERIFIED[:_](\d+)\s*\/\s*(\d+)/i;

/** Kode + angka untuk modal: `SCRAPER_ROLES_UNVERIFIED:7/312` (gagal/terbaca total). */
export function buildRolesUnverifiedWarning(
  unverified: number,
  scanned: number,
): `SCRAPER_ROLES_UNVERIFIED:${number}/${number}` {
  return `SCRAPER_ROLES_UNVERIFIED:${unverified}/${scanned}`;
}

export function resolveScrapeAlertMessage(
  code: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  platform?: Platform,
): string {
  const mapped = resolveScrapeErrorModalCode(code);
  if (mapped) {
    return resolveScrapeAlertMessageForCode(mapped, t, platform, code);
  }

  const factual = formatScrapeErrorForModal(code);
  if (factual && !isScrapeErrorCodeOnly(factual)) {
    return factual;
  }

  return resolveScrapeAlertMessageForCode(code as ScrapeErrorModalCode, t, platform);
}

function resolveScrapeAlertMessageForCode(
  code: ScrapeErrorModalCode | string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  platform?: Platform,
  rawCode?: string,
): string {
  const platformName =
    platform === 'whatsapp' ? 'WhatsApp' : platform === 'telegram' ? 'Telegram' : '';

  switch (code as ScrapeErrorModalCode) {
    case 'SCRAPER_WA_CONNECT_FAILED':
      return t('groupMonitoring.sync.scraperWaConnectFailed');
    case 'SCRAPER_TG_CONNECT_FAILED':
      return t('groupMonitoring.sync.scraperTgConnectFailed');
    case 'SCRAPER_TG_AUTH_KEY_DUPLICATED':
      return t('groupMonitoring.sync.tgAuthKeyDuplicated');
    case 'SCRAPER_WA_SESSION_UNLINKED':
      return t('groupMonitoring.sync.scraperWaSessionUnlinked');
    case 'SCRAPER_INCOMPLETE':
      return t('groupMonitoring.sync.scraperIncomplete');
    case 'SCRAPER_TRUNCATED_CAP':
      return t('groupMonitoring.sync.scraperTruncatedCap');
    case 'SCRAPER_ROLES_UNVERIFIED': {
      const counts = rawCode ? ROLES_UNVERIFIED_COUNTS_RE.exec(rawCode) : null;
      if (!counts) return t('groupMonitoring.sync.scraperRolesUnverified');
      const unverified = Number(counts[1]);
      const scanned = Number(counts[2]);
      return t('groupMonitoring.sync.scraperRolesUnverifiedCounts', {
        unverified,
        verified: Math.max(scanned - unverified, 0),
        scanned,
      });
    }
    case 'SCRAPER_WA_DISCONNECTED':
      return platform === 'telegram'
        ? t('groupMonitoring.sync.scraperConnectionLostTg')
        : t('groupMonitoring.sync.scraperConnectionLostWa');
    case 'SCRAPER_CONNECTION_LOST':
      if (platform === 'whatsapp') return t('groupMonitoring.sync.scraperConnectionLostWa');
      if (platform === 'telegram') return t('groupMonitoring.sync.scraperConnectionLostTg');
      return t('groupMonitoring.sync.scraperConnectionLostGeneric', {
        platform: platformName || 'messaging',
      });
    case 'SCRAPER_NETWORK_ERROR':
      return t('groupMonitoring.sync.scraperNetworkError');
    case 'SCRAPER_IDLE_STUCK':
      return platform === 'telegram'
        ? t('groupMonitoring.sync.scraperIdleStuckTg')
        : t('groupMonitoring.sync.scraperIdleStuckWa');
    case 'SCRAPER_WA_SYNC_PENDING':
      return t('groupMonitoring.sync.scraperWaSyncPending');
    case 'SCRAPER_LEGACY_TIMEOUT':
      return t('groupMonitoring.sync.scraperLegacyTimeout');
    case 'SCRAPER_CANCELLED':
      return t('groupMonitoring.sync.scrapeCancelledMessage');
    default:
      return code;
  }
}

/** Peta kode error sync/scrape/job-queue ke teks modal (i18n). */
export function resolveSyncFlowAlertMessage(
  code: string | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
  platform?: Platform,
): string {
  if (!code) return '';

  const modalCode =
    resolveScrapeErrorModalCode(code) ?? (isScrapeConnectionModalCode(code) ? code : null);
  if (modalCode) {
    return resolveScrapeAlertMessage(modalCode, t, platform);
  }

  const factual = formatScrapeErrorForModal(code);
  if (factual && !isScrapeErrorCodeOnly(factual)) {
    return factual;
  }

  if (code === 'SUPABASE_NOT_CONFIGURED') {
    return t('groupMonitoring.sync.supabaseNotConfigured');
  }
  if (code === 'SCRAPER_DESKTOP_REQUIRED') {
    return t('groupMonitoring.sync.scraperDesktopRequired');
  }
  if (code === 'SCRAPER_NO_GROUPS' || code.startsWith('SCRAPER_NO_GROUPS:')) {
    if (code.includes(':')) return code.replace('SCRAPER_NO_GROUPS: ', '');
    return t('groupMonitoring.sync.scraperNoGroups');
  }
  if (code.startsWith('WA_CLIENT_NOT_READY') || code.startsWith('WA_NOT_CONNECTED')) {
    return code.replace(/^WA_[A-Z_]+:\s*/, '');
  }
  if (code === 'AUTH_REQUIRED') {
    return t('groupMonitoring.sync.authRequired');
  }
  if (code === 'SYNC_FAILED') {
    return t('groupMonitoring.sync.syncFailed');
  }
  if (code === 'SESSION_WARM_PENDING' || code.startsWith('SESSION_WARM_PENDING:')) {
    if (isTelegramAuthKeyDeadMessage(code)) {
      return t('groupMonitoring.sync.tgAuthKeyDuplicated');
    }
    return t('groupMonitoring.sync.sessionWarmPending');
  }
  // Sidecar lama / pesan mentah Errno 22 — sama seperti warm pending (bukan restart app).
  {
    const lower = code.toLowerCase();
    if (
      !isTelegramAuthKeyDeadMessage(code) &&
      (lower.includes('errno 22') ||
        lower.includes('winerror 10022') ||
        lower.includes('invalid argument'))
    ) {
      return t('groupMonitoring.sync.sessionWarmPending');
    }
  }
  if (code === 'SESSION_SETTLING' || code === 'SESSION_CHECK_BUSY') {
    return t('groupMonitoring.sync.sessionCheckBusy');
  }
  if (code === 'EXECUTE_SLOTS_FULL') {
    return t('groupMonitoring.sync.executeSlotsQueued');
  }
  if (code === 'OPERATION_GLOBAL_BUSY') {
    return t('groupMonitoring.accountCard.operationGlobalBusy');
  }
  if (code === 'OPERATION_ALREADY_RUNNING') {
    return t('groupMonitoring.accountCard.operationAlreadyRunning');
  }
  if (code === 'JOB_QUEUE_EXECUTE_FULL') {
    return t('operations.jobQueue.executeFull');
  }
  if (code === 'SCRAPER_WRITE_FAILED' || code === 'SCRAPER_FAILED') {
    return t('groupMonitoring.sync.scraperFailed');
  }
  if (code.startsWith('SCRAPER_DB_WRITE:')) {
    return code.replace('SCRAPER_DB_WRITE: ', '');
  }
  if (code.startsWith('PHONE_COLUMN_MISSING:')) {
    return code.replace('PHONE_COLUMN_MISSING: ', '');
  }
  if (code.includes(PHONE_COLUMN_MIGRATION_HINT)) {
    return code;
  }
  if (code.includes(PLATFORM_SESSION_RLS_HINT)) {
    return code.replace('PLATFORM_SESSION_RLS: ', '');
  }
  return code;
}
