/** Apakah gagal scrape harus buka modal login (session benar-benar mati). */
export function scrapeFailureNeedsLoginModal(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes('still starting from a previous attempt')) return false;
  if (lower.includes('browser is already running')) return false;
  if (lower.includes('session_warm_pending')) return false;
  if (lower.includes('session check timed out')) return false;
  if (lower.includes('restore device session')) return false;
  if (lower.includes('timed out') && !lower.includes('not connected')) return false;

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
