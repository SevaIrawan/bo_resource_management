import { loadWhatsAppLocalAuthClientId } from '@/lib/platformSessions';
import type { Platform } from '@/types/database';

/** ID yang dipakai Electron/WA LocalAuth (bisa beda dari baris UI jika migrasi lama). */
export async function resolveDeviceSessionId(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
}): Promise<string> {
  if (input.platform === 'whatsapp') {
    const localAuthId = await loadWhatsAppLocalAuthClientId(input.accountId);
    if (localAuthId) return localAuthId;
  }
  return input.sessionId;
}
