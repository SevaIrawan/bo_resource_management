/** Semua chat grup WA (termasuk edge case di luar isGroup). */
export function isWhatsAppGroupChat(chat: {
  isGroup?: boolean;
  id?: { _serialized?: string; server?: string };
}): boolean {
  if (chat.isGroup) return true;
  const serialized = chat.id?._serialized ?? '';
  if (serialized.endsWith('@g.us')) return true;
  return chat.id?.server === 'g.us';
}
