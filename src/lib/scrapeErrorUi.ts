import type { Platform } from '@/types/database';
import {
  isWaLinkLoadingProbeMessage,
  isWaUnlinkedProbeMessage,
} from '@/lib/waLinkStatus';

/** Kode modal scrape — dipetakan ke i18n di AccountMonitoringSyncModals. */
export type ScrapeErrorModalCode =
  | 'SCRAPER_CANCELLED'
  | 'SCRAPER_WA_DISCONNECTED'
  | 'SCRAPER_CONNECTION_LOST'
  | 'SCRAPER_NETWORK_ERROR'
  | 'SCRAPER_IDLE_STUCK'
  | 'SCRAPER_WA_SYNC_PENDING'
  | 'SCRAPER_LEGACY_TIMEOUT';

export const SCRAPE_CONNECTION_MODAL_CODES: ReadonlySet<ScrapeErrorModalCode> = new Set([
  'SCRAPER_WA_DISCONNECTED',
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

/** Bersihkan bungkus IPC Electron `Error invoking remote method 'scraper:run'`. */
export function normalizeScrapeErrorMessage(message: string): string {
  const trimmed = message.trim();
  const invokeMatch = trimmed.match(
    /Error invoking remote method 'scraper:run':\s*(?:Error:\s*)?([\s\S]+)/i,
  );
  if (invokeMatch?.[1]) return invokeMatch[1].trim();
  return trimmed;
}

/** Client WA masih nyala / sync / timeout — bukan unlink di HP. */
export function isDeviceBusyMessage(message: string | undefined): boolean {
  if (!message) return false;
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
    lower.includes('session check timed out') ||
    lower.includes('session_check_timeout') ||
    (lower.includes('timed out') && lower.includes('restore device session'))
  );
}

/** Unlink di HP (UNPAIRED / logout) — DB + UI invalid. */
export function isDeviceSessionDeadMessage(message: string | undefined): boolean {
  if (!message || isDeviceBusyMessage(message)) return false;
  if (isWaUnlinkedProbeMessage(message)) return true;
  return scrapeFailureNeedsLoginModal(message);
}

export function scrapeFailureNeedsLoginModal(message: string): boolean {
  if (isDeviceBusyMessage(message)) return false;
  const lower = normalizeScrapeErrorMessage(message).toLowerCase();

  return (
    lower.includes('wa_not_connected') ||
    lower.includes('auth_failure') ||
    lower.includes('logged out') ||
    lower.includes('log out') ||
    lower.includes('unlink') ||
    lower.includes('session invalid') ||
    lower.includes('device_not_connected') ||
    (lower.includes('wa_client_not_ready') && lower.includes('lost'))
  );
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

/**
 * Teks modal scrape — pesan asli dari engine/IPC (fakta), bukan paragraf generik hardcode.
 * Hanya rapikan prefix internal; jangan ganti dengan template.
 */
export function formatScrapeErrorForModal(message: string): string {
  const normalized = normalizeScrapeErrorMessage(message).trim();
  if (!normalized) return '';

  if (normalized.startsWith('SCRAPER_IDLE_STUCK:')) {
    return normalized.slice('SCRAPER_IDLE_STUCK:'.length).trim();
  }

  return normalized;
}

/** Kode pendek tanpa detail — boleh pakai i18n fallback. */
export function isScrapeErrorCodeOnly(message: string): boolean {
  const n = formatScrapeErrorForModal(message);
  return /^(SCRAPER_[A-Z_]+|SCRAPER_FAILED|SYNC_FAILED)$/i.test(n);
}

export function resolveScrapeAlertMessage(
  code: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  platform?: Platform,
): string {
  const factual = formatScrapeErrorForModal(code);
  if (factual && !isScrapeErrorCodeOnly(factual)) {
    return factual;
  }

  const platformName =
    platform === 'whatsapp' ? 'WhatsApp' : platform === 'telegram' ? 'Telegram' : '';

  switch (code as ScrapeErrorModalCode) {
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
