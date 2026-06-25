import { writeScrapeDailyRows, type ScrapedGroupPayload } from '@/lib/accountScraper';
import { dedupeScrapedGroupsByGroupId } from '@/lib/dedupeScrapedGroups';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { isScrapeAbortMessage } from '@/lib/scrapeErrorUi';
import { withNetworkRetry } from '@/lib/networkRetry';
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
  /** UUID kanonik — sama dengan `account.id` baris grid; hindari resolve ulang. */
  dbAccountId?: string;
}

async function persistTelegramSession(accountId: string, sessionId: string): Promise<void> {
  const exporter = window.electronAPI?.scraper?.exportTelegramSession;
  if (!exporter) return;

  const exported = await withNetworkRetry('Export Telegram session after scrape', () =>
    exporter(sessionId),
  );
  await saveTelegramPlatformSession({
    accountId,
    sessionString: exported.sessionString,
    loginMethod: (exported.loginMethod as LoginMethod | undefined) ?? 'qr',
  });
}

export interface ScrapeRunCounts {
  deviceGroupCount: number;
  deviceAdminCount: number;
  masterCount: number;
}

function countAdminGroupsOnDevice(groups: ScrapedGroupPayload[]): number {
  return groups.filter((g) => g.is_admin === 'yes').length;
}

/** Satu pintu scrape renderer: Sync Now + kolom Run → Electron `scraper:run`. */
export async function runAccountScraper(input: RunAccountScraperInput): Promise<ScrapeRunCounts> {
  const api = window.electronAPI?.scraper;

  if (!api) {
    throw new Error('SCRAPER_DESKTOP_REQUIRED');
  }

  const accountId =
    input.dbAccountId ??
    (
      await resolveDbAccountForRow({
        userId: input.userId,
        account: input.account,
      })
    ).accountId;

  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: input.account.id,
    platform: input.account.platform,
    accountId,
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
      sessionId: deviceSessionId,
      platform: input.account.platform,
      accountId,
      storedSessionString,
      expectedPhone: input.account.phoneNumber?.trim() || undefined,
    });

    const scrapedGroups = dedupeScrapedGroupsByGroupId(result.groups as ScrapedGroupPayload[]);
    const scrapeWrite = await writeScrapeDailyRows({
      accountId,
      platform: input.account.platform,
      brand: input.account.brandName,
      accName: input.account.accountName,
      phoneNumber: input.account.phoneNumber,
      groups: scrapedGroups,
    });
    const deviceGroupCount = scrapeWrite.count;
    const deviceAdminCount = countAdminGroupsOnDevice(scrapedGroups);
    const masterCount = scrapeWrite.masterCount;

    if (input.account.platform === 'telegram') {
      await persistTelegramSession(accountId, deviceSessionId);
    }

    await markPlatformSessionSynced(accountId);
    if (runId) {
      await finishScrapeRun({
        runId,
        status: 'completed',
        groupsSuccess: deviceGroupCount,
      });
    }
    const scrapeMeta = result as {
      loggedInAs?: string;
      telegramUser?: string;
      elapsedMs?: number;
    };
    const identity = scrapeMeta.loggedInAs ?? scrapeMeta.telegramUser;
    const metaSuffix = identity
      ? ` (${identity}${scrapeMeta.elapsedMs ? `, ${Math.round(scrapeMeta.elapsedMs / 1000)}s` : ''})`
      : '';

    await logPlatformSessionEvent({
      accountId,
      platform: input.account.platform,
      eventType: 'login_success',
      message: `Scrape: ${deviceGroupCount} groups, admin ${deviceAdminCount}, master ${masterCount}${metaSuffix}`,
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

    return { deviceGroupCount, deviceAdminCount, masterCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scrape failed';
    const cancelled = isScrapeAbortMessage(message);
    if (runId) {
      await finishScrapeRun({
        runId,
        status: 'failed',
        groupsSuccess: 0,
        errorMessage: cancelled ? 'SCRAPER_CANCELLED' : message,
      });
    }
    if (!cancelled && input.account.platform === 'telegram') {
      try {
        await persistTelegramSession(accountId, deviceSessionId);
      } catch {
        // session may already be gone
      }
    }
    throw error;
  }
}
