import { buildMetricsFromScrapeDaily } from '@/lib/accountSyncData';
import { resolveBrandStandardTotal } from '@/lib/brandStandardCount';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { getErrorMessage } from '@/lib/errorMessage';
import { bootScrapeProgress } from '@/lib/scrapeProgressDisplay';
import { backfillPlatformSessionIfNeeded, hasStoredPlatformSession } from '@/lib/sessionAvailability';
import { warmSessionIfStored } from '@/lib/warmPlatformSession';
import {
  buildLogoutRowAfterDeviceFailure,
  checkDeviceSessionForValidColumn,
  reloginCodeForSync,
  routeFromSessionColumn,
  type SyncLoginReloginCode,
} from '@/services/syncFlowService';
import { runAccountScraper } from '@/lib/runAccountScraper';
import {
  markAccountLoginGrace,
  markAccountScrapeGrace,
  isAccountInLoginGrace,
} from '@/lib/sessionRealtimePolicy';
import { invalidateUserSessionOnDeviceFailure } from '@/lib/userActionSession';
import { scrapeFailureNeedsLoginModal } from '@/lib/scrapeErrorUi';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { UiScrapeProgress } from '@/types/scrapeProgress';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

export type ScrapeRunOutcome =
  | {
      kind: 'invalidated-login';
      reloginCode: SyncLoginReloginCode;
      dbAccountId: string;
      invalidResult: AccountSyncResult;
    }
  | { kind: 'device_busy'; message: string; dbAccountId: string }
  | { kind: 'error'; message: string; needsLogin: boolean; dbAccountId?: string }
  | {
      kind: 'success';
      dbAccountId: string;
      deviceSessionId: string;
      result: AccountSyncResult;
      masterJoined: number;
      scrapedAt: string;
      brandX: number;
    };

export async function resolveScrapeLoginIfNeeded(input: {
  userId: string;
  account: AccountBrandRow;
}): Promise<{ reloginCode: SyncLoginReloginCode; dbAccountId: string } | null> {
  if (routeFromSessionColumn(input.account.sessionStatus) !== 'open_login') {
    return null;
  }
  const { accountId: dbAccountId } = await resolveDbAccountForRow({
    userId: input.userId,
    account: input.account,
  });
  const hasStored = await hasStoredPlatformSession(dbAccountId, input.account.platform);
  return {
    reloginCode: reloginCodeForSync({ hasStoredSession: hasStored, hasDailyToday: false }),
    dbAccountId,
  };
}

export async function executeScrapeRun(input: {
  userId: string;
  account: AccountBrandRow;
  dbAccountId: string;
  skipDeviceCheck?: boolean;
  onSessionProbeComplete?: () => void;
}): Promise<ScrapeRunOutcome> {
  const { account, userId, dbAccountId } = input;

  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: account.id,
    platform: account.platform,
    accountId: dbAccountId,
  });

  const skipProbe =
    input.skipDeviceCheck === true || isAccountInLoginGrace(account.id);

  if (!skipProbe) {
    const deviceCheck = await checkDeviceSessionForValidColumn({
      sessionId: account.id,
      platform: account.platform,
      dbAccountId,
      action: 'run',
    });

    if (!deviceCheck.ok) {
      if (deviceCheck.busy) {
        return {
          kind: 'device_busy',
          message: deviceCheck.message,
          dbAccountId,
        };
      }

      let brandX = account.groupsTotal > 0 ? account.groupsTotal : 0;
      const supabase = getSupabase();
      if (supabase) {
        const { data: accRow } = await supabase
          .from(TABLES.messagingAccounts)
          .select('brand_id')
          .eq('id', dbAccountId)
          .maybeSingle();
        const brandId = accRow?.brand_id as string | undefined;
        if (brandId) {
          brandX = await resolveBrandStandardTotal(
            brandId,
            account.platform,
            brandX,
            account.brandName,
          );
        }
      }

      const invalidResult = await buildLogoutRowAfterDeviceFailure({
        dbAccountId,
        brand: account.brandName,
        platform: account.platform,
        brandStandard: brandX,
        message: deviceCheck.message,
        shouldInvalidate: deviceCheck.shouldInvalidate,
      });

      return {
        kind: 'invalidated-login',
        reloginCode: deviceCheck.reloginCode,
        dbAccountId,
        invalidResult,
      };
    }
  }

  input.onSessionProbeComplete?.();

  try {
    await runAccountScraper({
      account,
      sessionId: account.id,
      userId,
      dbAccountId,
    });

    const supabase = getSupabase();
    const brandId =
      (
        await supabase
          ?.from(TABLES.messagingAccounts)
          .select('brand_id')
          .eq('id', dbAccountId)
          .maybeSingle()
      )?.data?.brand_id as string | undefined;

    let brandX = 0;
    if (brandId) {
      brandX = await resolveBrandStandardTotal(
        brandId,
        account.platform,
        0,
        account.brandName,
      );
    }

    const { result: built, master } = await buildMetricsFromScrapeDaily({
      accountId: dbAccountId,
      brand: account.brandName,
      platform: account.platform,
      sessionValid: true,
      forceFresh: true,
    });

    markAccountScrapeGrace(account.id);
    markAccountLoginGrace(account.id);

    return {
      kind: 'success',
      dbAccountId,
      deviceSessionId,
      result: built,
      masterJoined: master.joinedInMaster,
      scrapedAt: new Date().toISOString(),
      brandX,
    };
  } catch (error) {
    const message = getErrorMessage(error, 'SCRAPER_FAILED');

    if (scrapeFailureNeedsLoginModal(message)) {
      const { accountId: dbForLogin } = await resolveDbAccountForRow({ userId, account }).catch(
        () => ({ accountId: account.id, matchedBy: 'none' as const }),
      );
      await invalidateUserSessionOnDeviceFailure({
        dbAccountId: dbForLogin,
        platform: account.platform,
        message,
        shouldInvalidate: true,
      });
      return {
        kind: 'error',
        message,
        needsLogin: true,
        dbAccountId: dbForLogin,
      };
    }

    return { kind: 'error', message, needsLogin: false };
  }
}

export async function prepareScrapeSession(input: {
  account: AccountBrandRow;
  dbAccountId: string;
  label: (key: string) => string;
}): Promise<{ deviceSessionId: string; bootProgress: UiScrapeProgress }> {
  const deviceSessionId = await resolveDeviceSessionId({
    sessionId: input.account.id,
    platform: input.account.platform,
    accountId: input.dbAccountId,
  });

  return {
    deviceSessionId,
    bootProgress: bootScrapeProgress(input.account, input.label),
  };
}

export async function runScrapeFlow(input: {
  userId: string;
  account: AccountBrandRow;
  dbAccountId: string;
  skipDeviceCheck?: boolean;
  onSessionProbeComplete?: () => void;
}): Promise<ScrapeRunOutcome> {
  await backfillPlatformSessionIfNeeded({
    userId: input.userId,
    account: input.account,
    dbAccountId: input.dbAccountId,
  });

  await warmSessionIfStored({
    sessionId: input.account.id,
    platform: input.account.platform,
    accountId: input.dbAccountId,
    userId: input.userId,
  });

  return executeScrapeRun({
    userId: input.userId,
    account: input.account,
    dbAccountId: input.dbAccountId,
    skipDeviceCheck: input.skipDeviceCheck === true,
    onSessionProbeComplete: input.onSessionProbeComplete,
  });
}
