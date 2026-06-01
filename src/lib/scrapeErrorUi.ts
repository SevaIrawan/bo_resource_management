import {
  isWaLinkLoadingProbeMessage,
  isWaUnlinkedProbeMessage,
} from '@/lib/waLinkStatus';

/** Client WA masih nyala / sync / timeout — bukan unlink di HP. */
export function isDeviceBusyMessage(message: string | undefined): boolean {
  if (!message) return false;
  if (isWaLinkLoadingProbeMessage(message)) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('browser is already running') ||
    lower.includes('still starting from a previous attempt') ||
    lower.includes('session_warm_pending') ||
    lower.includes('wa_store_not_ready') ||
    lower.includes('session check timed out') ||
    (lower.includes('timed out') && lower.includes('restore device session'))
  );
}

/** Unlink di HP (UNPAIRED / logout) — DB + UI invalid. */
export function isDeviceSessionDeadMessage(message: string | undefined): boolean {
  if (!message || isDeviceBusyMessage(message)) return false;
  if (isWaUnlinkedProbeMessage(message)) return true;
  return scrapeFailureNeedsLoginModal(message);
}

/** Apakah gagal scrape harus buka modal login (session benar-benar mati). */
export function scrapeFailureNeedsLoginModal(message: string): boolean {
  if (isDeviceBusyMessage(message)) return false;
  const lower = message.toLowerCase();

  return (
    lower.includes('wa_not_connected') ||
    lower.includes('not connected') ||
    lower.includes('disconnected') ||
    lower.includes('auth_failure') ||
    lower.includes('logged out') ||
    lower.includes('log out') ||
    lower.includes('unlink') ||
    lower.includes('session invalid') ||
    lower.includes('device_not_connected')
  );
}
