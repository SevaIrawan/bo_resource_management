import { patchBrandGroup, rebuildGroupMetrics } from '@/lib/accountBrandUtils';
import { applyScrapeMetricsToGroups } from '@/lib/applyScrapeMetricsToGroups';import { accountMissingRequiredPhone } from '@/lib/accountPhone';
import { patchAccountSessionInGroups } from '@/lib/accountSessionPatch';
import { buildMetricsFromScrapeDaily } from '@/lib/accountSyncData';
import { teardownAutoScrapeDevice } from '@/lib/autoScrapeDeviceTeardown';
import { isAutoScrapeLaneReadyForAccount } from '@/lib/autoScrapeLaneClient';
import { resolveBrandStandardTotal } from '@/lib/brandStandardCount';
import {
  AUTO_SCRAPE_POLICY,
  type AutoScrapeCycleControl,
} from '@/config/autoScrapePolicy';
import {
  isAccountSessionSettling,
  isHeavyDeviceExecuteBlockedForAccount,
} from '@/lib/automationJobQueueClient';
import { dispatchMonitoringReloadAfterDailyWrite } from '@/lib/monitoringRealtimeEvents';
import { runAutoAccountScraper } from '@/lib/runAutoAccountScraper';
import { recordSyncActivity } from '@/lib/syncActivityLog';
import {
  isScrapeUserCancelledMessage,
  normalizeScrapeErrorMessage,
  scrapeFailureNeedsLoginModal,
} from '@/lib/scrapeErrorUi';
import { markAccountScrapeGrace } from '@/lib/sessionRealtimePolicy';
import {
  resolveDbAccountId,
  routeFromSessionColumn,
} from '@/services/syncFlowService';
import { resolveScrapeLoginIfNeeded } from '@/services/scrapeFlowService';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Dispatch, SetStateAction } from 'react';

export type AutoScrapeAccountResult = 'success' | 'skipped' | 'failed' | 'aborted';

/** Auto Scrape (Settings) — skip akun yang tidak memenuhi syarat scrape otomatis. */
export function shouldSkipAutoScrapeAccount(
  account: AccountBrandRow,
  suspendedIds: ReadonlySet<string>,
): boolean {
  if (suspendedIds.has(account.id)) return true;
  if (account.sessionStatus !== 'valid') return true;
  if (account.syncState === 'pending') return true;
  if (account.actionProcess) return true;
  if (routeFromSessionColumn(account.sessionStatus) === 'open_login') return true;
  if (accountMissingRequiredPhone(account.platform, account.phoneNumber ?? '')) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isAborted(control?: AutoScrapeCycleControl): boolean {
  return control?.isAborted() === true;
}

/** Tunggu user lane bebas untuk akun ini — timeout, skip jika stuck. */
export async function waitUntilAutoScrapeAccountReady(
  account: AccountBrandRow,
  suspendedIds: ReadonlySet<string>,
  control?: AutoScrapeCycleControl,
  dbAccountId?: string,
): Promise<boolean> {
  const started = Date.now();

  while (Date.now() - started < AUTO_SCRAPE_POLICY.readyMaxWaitMs) {
    if (isAborted(control)) return false;
    if (shouldSkipAutoScrapeAccount(account, suspendedIds)) return false;

    const heavy = await isHeavyDeviceExecuteBlockedForAccount(account.id);
    const settling = await isAccountSessionSettling(account);
    const laneReady = await isAutoScrapeLaneReadyForAccount(account, dbAccountId);

    if (!heavy && !settling && laneReady) return true;

    await sleep(AUTO_SCRAPE_POLICY.readyPollMs);
  }

  return false;
}

/**
 * Satu akun auto scrape — lane terpisah, update grid per sukses; gagal skip + tutup Chrome.
 */
export async function runAutoAccountScrape(input: {
  userId: string;
  group: AccountBrandGroup;
  account: AccountBrandRow;
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  cycleControl?: AutoScrapeCycleControl;
  suspendedIds?: ReadonlySet<string>;
  onActiveChange?: (active: { account: AccountBrandRow; dbAccountId?: string } | null) => void;
}): Promise<AutoScrapeAccountResult> {
  const { userId, group, account, onGroupsChange, cycleControl, onActiveChange } = input;
  const suspendedIds = input.suspendedIds ?? new Set<string>();

  if (isAborted(cycleControl)) return 'aborted';

  let dbAccountId = '';

  const setActive = (dbId?: string) => {
    onActiveChange?.({ account, dbAccountId: dbId });
  };

  const clearActive = () => {
    onActiveChange?.(null);
  };

  try {
    dbAccountId = await resolveDbAccountId({ userId, account });

    const ready = await waitUntilAutoScrapeAccountReady(
      account,
      suspendedIds,
      cycleControl,
      dbAccountId,
    );
    if (!ready) return isAborted(cycleControl) ? 'aborted' : 'skipped';

    setActive(dbAccountId);

    if (isAborted(cycleControl)) return 'aborted';

    const loginNeeded = await resolveScrapeLoginIfNeeded({ userId, account });
    if (loginNeeded) {
      onGroupsChange((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
      return 'failed';
    }

    await runAutoAccountScraper({
      account,
      sessionId: account.id,
      userId,
      dbAccountId,
    });

    if (isAborted(cycleControl)) return 'aborted';

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
      brandX = await resolveBrandStandardTotal(brandId, account.platform, 0, account.brandName);
    }

    const { result: built, master } = await buildMetricsFromScrapeDaily({
      accountId: dbAccountId,
      brand: account.brandName,
      platform: account.platform,
      sessionValid: true,
      forceFresh: true,
    });

    markAccountScrapeGrace(account.id);

    await applyScrapeMetricsToGroups(onGroupsChange, group.id, account.id, built, {
      masterTotal: master.joinedInMaster,
      lastSyncAt: new Date().toISOString(),
      preserveActionProcess: true,
      preserveSession: true,
    });

    if (brandX > 0) {
      onGroupsChange((prev) =>
        patchBrandGroup(prev, group.id, (g) =>
          rebuildGroupMetrics({
            ...g,
            standardGroupCountByPlatform: {
              ...g.standardGroupCountByPlatform,
              [account.platform]: brandX,
            },
            accounts: g.accounts.map((row) =>
              row.platform === account.platform && row.id !== account.id
                ? { ...row, groupsTotal: brandX, adminTotal: brandX }
                : row,
            ),
          }),
        ),
      );
    }

    await recordSyncActivity({
      accountId: dbAccountId,
      platform: account.platform,
      syncSource: 'auto',
      sessionStatus: 'valid',
      deviceGroups: built.groupsCurrent,
      brandGroups: built.groupsTotal,
      adminGroups: built.adminCurrent,
      message: `auto_scrape:${built.groupsCurrent}/${built.groupsTotal}`,
    });

    dispatchMonitoringReloadAfterDailyWrite();
    return 'success';
  } catch (error) {
    const message = normalizeScrapeErrorMessage(
      error instanceof Error ? error.message : 'Auto scrape failed',
    );

    if (isScrapeUserCancelledMessage(message) || isAborted(cycleControl)) {
      return isAborted(cycleControl) ? 'aborted' : 'failed';
    }

    if (scrapeFailureNeedsLoginModal(message)) {
      onGroupsChange((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
    }

    return 'failed';
  } finally {
    clearActive();
    await teardownAutoScrapeDevice({ account, dbAccountId: dbAccountId || undefined });
  }
}
