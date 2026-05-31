import {
  resolveMessagingAccountId,
  writeScrapeDailyRows,
  type ScrapedGroupPayload,
} from '@/lib/accountScraper';
import { finishScrapeRun, startScrapeRun } from '@/lib/scrapeRuns';
import {
  loadTelegramPlatformSession,
  markPlatformSessionSynced,
  saveTelegramPlatformSession,
} from '@/lib/platformSessions';
import { logPlatformSessionEvent } from '@/lib/platformSessionLogs';
import { persistBrandStandardCount } from '@/lib/brandStandardCount';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { LoginMethod } from '@/types/database';

export interface RunAccountScraperInput {
  account: AccountBrandRow;
  sessionId: string;
  userId: string;
}

async function persistTelegramSession(accountId: string, sessionId: string): Promise<void> {
  const exporter = window.electronAPI?.scraper?.exportTelegramSession;
  if (!exporter) return;

  const exported = await exporter(sessionId);
  await saveTelegramPlatformSession({
    accountId,
    sessionString: exported.sessionString,
    loginMethod: (exported.loginMethod as LoginMethod | undefined) ?? 'qr',
  });
}

export interface ScrapeRunCounts {
  deviceGroupCount: number;
  masterCount: number;
}

export async function runAccountScraper(input: RunAccountScraperInput): Promise<ScrapeRunCounts> {
  const api = window.electronAPI?.scraper;

  if (!api) {
    throw new Error('SCRAPER_DESKTOP_REQUIRED');
  }

  const accountId = await resolveMessagingAccountId({
    userId: input.userId,
    platform: input.account.platform,
    brand: input.account.brandName,
    accName: input.account.accountName,
    phoneNumber: input.account.phoneNumber,
    localId: input.account.id,
  });

  const storedSessionString =
    input.account.platform === 'telegram'
      ? await loadTelegramPlatformSession(accountId)
      : null;

  const runId = await startScrapeRun({
    accountId,
    platform: input.account.platform,
  });

  try {
    const result = await api.run({
      sessionId: input.sessionId,
      platform: input.account.platform,
      storedSessionString,
    });

    const scrapeWrite = await writeScrapeDailyRows({
      accountId,
      platform: input.account.platform,
      brand: input.account.brandName,
      accName: input.account.accountName,
      phoneNumber: input.account.phoneNumber,
      groups: result.groups as ScrapedGroupPayload[],
    });
    const deviceGroupCount = scrapeWrite.count;
    const masterCount = scrapeWrite.masterCount;

    if (input.account.platform === 'telegram') {
      await persistTelegramSession(accountId, input.sessionId);
    }

    await markPlatformSessionSynced(accountId);
    if (runId) {
      await finishScrapeRun({
        runId,
        status: 'completed',
        groupsSuccess: deviceGroupCount,
      });
    }
    await logPlatformSessionEvent({
      accountId,
      platform: input.account.platform,
      eventType: 'login_success',
      message: `Scrape: ${deviceGroupCount} groups on device, ${masterCount} in brand master`,
    });
    const supabase = getSupabase();
    if (supabase) {
      const { data: accRow } = await supabase
        .from(TABLES.messagingAccounts)
        .select('brand_id')
        .eq('id', accountId)
        .maybeSingle();
      const brandId = accRow?.brand_id as string | undefined;
      if (brandId) {
        await persistBrandStandardCount(
          brandId,
          input.account.platform,
          input.account.brandName,
        );
      }
    }

    return { deviceGroupCount, masterCount };
  } catch (error) {
    if (runId) {
      await finishScrapeRun({
        runId,
        status: 'failed',
        groupsSuccess: 0,
        errorMessage: error instanceof Error ? error.message : 'Scrape failed',
      });
    }
    if (input.account.platform === 'telegram') {
      try {
        await persistTelegramSession(accountId, input.sessionId);
      } catch {
        // session may already be gone
      }
    }
    throw error;
  }
}
