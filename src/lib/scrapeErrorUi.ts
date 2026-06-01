/** Client WA/Puppeteer masih dipakai operasi lain — bukan logout. */
export function isDeviceBusyMessage(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('browser is already running') ||
    lower.includes('still starting from a previous attempt') ||
    lower.includes('session_warm_pending') ||
    lower.includes('session check timed out') ||
    (lower.includes('timed out') && lower.includes('restore device session'))
  );
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
