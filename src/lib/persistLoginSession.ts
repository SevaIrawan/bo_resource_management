import { resolveMessagingAccountId } from '@/lib/accountScraper';
import {
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

  const dbAccountId = await resolveMessagingAccountId({
    userId: input.userId,
    platform: input.account.platform,
    brand: input.account.brandName,
    accName: input.account.accountName,
    phoneNumber: input.account.phoneNumber,
    localId: input.account.id,
  });

  const exported = await exporter(input.account.id);
  await saveTelegramPlatformSession({
    accountId: dbAccountId,
    sessionString: exported.sessionString,
    loginMethod: (exported.loginMethod as LoginMethod | undefined) ?? input.loginMethod ?? 'qr',
  });

  return dbAccountId;
}

export async function persistWhatsAppLoginSession(input: {
  userId: string;
  account: AccountBrandRow;
  loginMethod?: LoginMethod;
}): Promise<string> {
  const dbAccountId = await resolveMessagingAccountId({
    userId: input.userId,
    platform: input.account.platform,
    brand: input.account.brandName,
    accName: input.account.accountName,
    phoneNumber: input.account.phoneNumber,
    localId: input.account.id,
  });

  await saveWhatsAppPlatformSession({
    accountId: dbAccountId,
    localAuthClientId: input.account.id,
    loginMethod: input.loginMethod ?? 'qr',
  });

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
