import {
  readTelegramWorkerSettings,
  readWhatsAppWorkerSettings,
  toAutomationDelayConfig,
} from '@/config/workerPlatformSettings';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { loadTelegramPlatformSession } from '@/lib/platformSessions';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { AutomationJobAction, AutomationJobDelayConfig } from '@/types/automationJob';

export async function buildAutomationJobRunContext(
  account: AccountBrandRow,
  action: AutomationJobAction,
): Promise<{
  sessionId: string;
  storedSessionString: string | null;
  expectedPhone?: string;
  delay: AutomationJobDelayConfig;
}> {
  const sessionId = await resolveDeviceSessionId({
    sessionId: account.id,
    platform: account.platform,
    accountId: account.id,
  });
  const storedSessionString =
    account.platform === 'telegram' ? await loadTelegramPlatformSession(account.id) : null;
  const settings =
    account.platform === 'telegram'
      ? readTelegramWorkerSettings()
      : readWhatsAppWorkerSettings();

  return {
    sessionId,
    storedSessionString,
    expectedPhone: account.phoneNumber?.trim() || undefined,
    delay: toAutomationDelayConfig(settings, action),
  };
}
