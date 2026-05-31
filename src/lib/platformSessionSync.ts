import { logPlatformSessionEvent } from '@/lib/platformSessionLogs';
import {
  hasActivePlatformSession,
  markPlatformSessionInvalid,
  savePlatformSession,
} from '@/lib/platformSessions';
import type { Platform } from '@/types/database';

/**
 * Database session invalid → lepas session di device (Electron).
 * Dipanggil dari Supabase Realtime saat is_active = false.
 */
export async function releasePlatformSessionOnDevice(
  accountId: string,
  options?: { purgeWaDisk?: boolean },
): Promise<void> {
  await window.electronAPI?.platformLogin?.release(accountId, options);
}

export async function purgeWhatsAppAuthOnDevice(accountId: string): Promise<void> {
  await window.electronAPI?.platformLogin?.purgeWaAuth?.(accountId);
}

/**
 * Device logout / session mati → invalidasi DB dulu (Realtime ke client lain), lalu lepas device.
 */
export async function invalidatePlatformSessionEverywhere(
  accountId: string,
  reason = 'revoked',
  platform: Platform = 'telegram',
  options?: { purgeWaDisk?: boolean },
): Promise<void> {
  await markPlatformSessionInvalid(accountId, reason);
  await logPlatformSessionEvent({
    accountId,
    platform,
    eventType: 'db_invalidated',
    message: reason,
  });
  await releasePlatformSessionOnDevice(accountId, {
    purgeWaDisk: options?.purgeWaDisk,
  });
}

/** Simpan session aktif ke DB (TG string / WA local auth client id). */
export async function persistPlatformSessionToDatabase(input: {
  accountId: string;
  sessionData: string;
  sessionType: 'telethon_string' | 'whatsapp_local_auth';
  loginMethod?: 'qr' | 'phone';
}): Promise<void> {
  await savePlatformSession(input);
}

/** Sinkronkan status UI dari baris DB (tanpa probe). */
export async function syncSessionStatusFromDatabase(
  accountId: string,
): Promise<'valid' | 'invalid'> {
  const active = await hasActivePlatformSession(accountId);
  return active ? 'valid' : 'invalid';
}

export function isElectronSessionApiReady(): boolean {
  return Boolean(window.electronAPI?.isElectron && window.electronAPI.platformLogin?.release);
}

export type PlatformSessionInvalidPayload = {
  sessionId: string;
  platform: Platform;
  message?: string;
};

/** Event device (WA disconnect, auth failure) → DB invalid + cleanup device. */
export async function handleDeviceSessionInvalid(
  payload: PlatformSessionInvalidPayload,
): Promise<void> {
  const reason =
    payload.message?.slice(0, 120) ||
    (payload.platform === 'whatsapp' ? 'disconnected' : 'session_expired');
  await markPlatformSessionInvalid(payload.sessionId, reason);
  await logPlatformSessionEvent({
    accountId: payload.sessionId,
    platform: payload.platform,
    eventType: 'device_logout',
    message: reason,
  });
  await releasePlatformSessionOnDevice(payload.sessionId);
}
