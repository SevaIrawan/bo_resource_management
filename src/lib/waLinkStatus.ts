/** Mirror pesan probe dari `electron/main/scraper/whatsappLinkState.ts`. */

export function isWaUnlinkedProbeMessage(message: string | undefined): boolean {
  if (!message) return false;
  if (message.startsWith('WA_UNLINKED:')) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('unpaired') ||
    lower.includes('logged out') ||
    lower.includes('log out') ||
    lower.includes('unlink') ||
    lower.includes('auth_failure')
  );
}

export function isWaLinkLoadingProbeMessage(message: string | undefined): boolean {
  if (!message) return false;
  return message.startsWith('WA_LINK_LOADING:') || message === 'WA_LINK_UNKNOWN';
}
