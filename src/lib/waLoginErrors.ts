export function isWhatsAppBrowserBusyMessage(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('browser is already running') ||
    lower.includes('still starting from a previous attempt') ||
    lower.includes('qr code did not appear within')
  );
}
