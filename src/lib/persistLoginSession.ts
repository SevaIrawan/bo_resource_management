import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { withNetworkRetry } from '@/lib/networkRetry';
import { withTimeout } from '@/lib/withTimeout';
import {
  hasActivePlatformSession,
  saveTelegramPlatformSession,
  saveWhatsAppPlatformSession,
} from '@/lib/platformSessions';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { LoginMethod } from '@/types/database';

export async function persistTelegramLoginSession(input: {
  userId: string;
  account: AccountBrandRow;
  loginMethod?: LoginMethod;
}): Promise<string> {
  const exporter = window.electronAPI?.scraper?.exportTelegramSession;
  if (!exporter) {
    throw new Error('SCRAPER_DESKTOP_REQUIRED');
  }

  const { accountId: dbAccountId } = await resolveDbAccountForRow({
    userId: input.userId,
    account: input.account,
  });

  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: input.account.id,
    platform: 'telegram',
    accountId: dbAccountId,
  });

  await new Promise((resolve) => setTimeout(resolve, 1_500));

  const exported = await withNetworkRetry('Export Telegram session', () =>
    withTimeout(exporter(deviceSessionId), 90_000, 'Export Telegram session'),
  );
  await saveTelegramPlatformSession({
    accountId: dbAccountId,
    sessionString: exported.sessionString,
    loginMethod: (exported.loginMethod as LoginMethod | undefined) ?? input.loginMethod ?? 'qr',
  });

  if (!(await hasActivePlatformSession(dbAccountId))) {
    throw new Error('SESSION_DB_WRITE_FAILED: Telegram session not saved to Supabase');
  }

  return dbAccountId;
}

export async function persistWhatsAppLoginSession(input: {
  userId: string;
  account: AccountBrandRow;
  loginMethod?: LoginMethod;
}): Promise<string> {
  const { accountId: dbAccountId } = await resolveDbAccountForRow({
    userId: input.userId,
    account: input.account,
  });

  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: input.account.id,
    platform: 'whatsapp',
    accountId: dbAccountId,
  });

  await saveWhatsAppPlatformSession({
    accountId: dbAccountId,
    localAuthClientId: deviceSessionId,
    loginMethod: input.loginMethod ?? 'qr',
  });

  if (!(await hasActivePlatformSession(dbAccountId))) {
    throw new Error(
      'SESSION_DB_WRITE_FAILED: WhatsApp session not saved to platform_sessions. Run scripts/repair-wa-session.mjs',
    );
  }

  return dbAccountId;
}

/** Setelah login WA/TG sukses — wajib tulis session aktif ke DB (Realtime). */
export async function persistLoginSessionAfterSuccess(input: {
  userId: string;
  account: AccountBrandRow;
  loginMethod?: LoginMethod;
}): Promise<string> {
  if (input.account.platform === 'telegram') {
    return persistTelegramLoginSession(input);
  }
  return persistWhatsAppLoginSession(input);
}

export function isProbeSkipMessage(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('not ready') ||
    lower.includes('log in first') ||
    lower.includes('need_2fa') ||
    lower.includes('need_code') ||
    lower.includes('disconnected') ||
    lower.includes('validate failed') ||
    lower.includes('whatsapp state')
  );
}
