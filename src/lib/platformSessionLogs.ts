import { recordSessionActivityStatus } from '@/lib/recordSessionActivity';
import type { LoginMethod, Platform, PlatformSessionEventType } from '@/types/database';

/** Status yang ditampilkan di activity log per akun. */
export type SessionActivityStatus = 'valid' | 'logout' | 'invalid' | 'replaced';

function reasonToActivityStatus(reason: string): SessionActivityStatus {
  const lower = reason.toLowerCase();
  if (lower.includes('logout') || lower.includes('disconnect') || lower === 'device_logout') {
    return 'logout';
  }
  if (lower === 'replaced') return 'replaced';
  return 'invalid';
}

/** Session masih aktif di DB — catat VALID. */
export async function logSessionValidActivity(input: {
  accountId: string;
  platform: Platform;
  message?: string;
  platformSessionId?: string | null;
}): Promise<void> {
  await recordSessionActivityStatus({
    accountId: input.accountId,
    platform: input.platform,
    sessionStatus: 'valid',
    eventType: 'sync_valid',
    message: input.message ?? 'Session valid on device',
    platformSessionId: input.platformSessionId,
  });
}

/** Logout / invalid — coalesce baris sama (butuh migrasi 023). */
export async function logSessionLogoutActivity(input: {
  accountId: string;
  platform: Platform;
  reason?: string;
  platformSessionId?: string | null;
}): Promise<void> {
  const status = reasonToActivityStatus(input.reason ?? 'logout');
  await recordSessionActivityStatus({
    accountId: input.accountId,
    platform: input.platform,
    sessionStatus: status,
    eventType:
      status === 'logout'
        ? 'device_logout'
        : status === 'replaced'
          ? 'session_replaced'
          : 'db_invalidated',
    message: input.reason ?? status,
    platformSessionId: input.platformSessionId,
  });
}

export async function logPlatformSessionEvent(input: {
  accountId: string;
  platform: Platform;
  eventType: PlatformSessionEventType;
  message?: string;
  loginMethod?: LoginMethod;
  platformSessionId?: string | null;
  sessionStatus?: SessionActivityStatus;
}): Promise<void> {
  const status =
    input.sessionStatus ??
    (input.eventType === 'login_success' || input.eventType === 'sync_valid'
      ? 'valid'
      : input.eventType === 'device_logout' || input.eventType === 'disconnect'
        ? 'logout'
        : 'invalid');

  await recordSessionActivityStatus({
    accountId: input.accountId,
    platform: input.platform,
    sessionStatus: status,
    eventType: input.eventType,
    message: input.message,
    loginMethod: input.loginMethod,
    platformSessionId: input.platformSessionId,
  });
}
