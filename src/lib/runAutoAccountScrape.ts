import { patchBrandStandardCountForPlatform } from '@/lib/accountBrandUtils';
import { applyScrapeMetricsToGroups } from '@/lib/applyScrapeMetricsToGroups';
import { accountMissingRequiredPhone } from '@/lib/accountPhone';
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

export type AutoScrapeAccountResult =
  | 'success'
  | 'truncated'
  | 'skipped'
  | 'busy'
  | 'failed'
  | 'aborted';

/** Kenapa akun belum boleh auto scrape. `busy` = lane user/job masih pegang akun. */
export type AutoScrapeReadiness = 'ready' | 'busy' | 'skipped' | 'aborted';

/** Auto Scrape (Settings) — skip akun yang tidak memenuhi syarat scrape otomatis. */
export function shouldSkipAutoScrapeAccount(
  account: AccountBrandRow,
  suspendedIds: ReadonlySet<string>,
): boolean {
  if (suspendedIds.has(account.id)) return true;
  if (account.status !== 'active') return true;
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

/**
 * Tunggu user lane bebas untuk akun ini.
 *
 * Yang duluan jalan menang: scrape manual / job queue yang sedang pegang akun tidak
 * pernah diputus auto scrape — auto yang mengalah dan dilaporkan `busy`.
 */
export async function waitUntilAutoScrapeAccountReady(
  account: AccountBrandRow,
  suspendedIds: ReadonlySet<string>,
  control?: AutoScrapeCycleControl,
  dbAccountId?: string,
): Promise<AutoScrapeReadiness> {
  const started = Date.now();

  while (Date.now() - started < AUTO_SCRAPE_POLICY.readyMaxWaitMs) {
    if (isAborted(control)) return 'aborted';
    if (control?.isAccountSelected && !control.isAccountSelected(account.id)) return 'aborted';
    if (shouldSkipAutoScrapeAccount(account, suspendedIds)) return 'skipped';

    const heavy = await isHeavyDeviceExecuteBlockedForAccount(account.id);
    const settling = await isAccountSessionSettling(account);
    const laneReady = await isAutoScrapeLaneReadyForAccount(account, dbAccountId);

    if (!heavy && !settling && laneReady) return 'ready';

    await sleep(AUTO_SCRAPE_POLICY.readyPollMs);
  }

  return 'busy';
}

/**
 * Satu akun auto scrape — lane terpisah, update grid per sukses; gagal skip + tutup Chrome.
 */
export type AutoScrapeActiveEvent =
  | { kind: 'start'; account: AccountBrandRow; dbAccountId?: string }
  | { kind: 'end'; accountId: string };

export async function runAutoAccountScrape(input: {
  userId: string;
  group: AccountBrandGroup;
  account: AccountBrandRow;
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  cycleControl?: AutoScrapeCycleControl;
  suspendedIds?: ReadonlySet<string>;
  onActiveChange?: (event: AutoScrapeActiveEvent) => void;
}): Promise<AutoScrapeAccountResult> {
  const { userId, group, account, onGroupsChange, cycleControl, onActiveChange } = input;
  const suspendedIds = input.suspendedIds ?? new Set<string>();

  if (isAborted(cycleControl)) return 'aborted';

  let dbAccountId = '';

  const markStart = (dbId?: string) => {
    onActiveChange?.({ kind: 'start', account, dbAccountId: dbId });
  };

  const markEnd = () => {
    onActiveChange?.({ kind: 'end', accountId: account.id });
  };

  try {
    dbAccountId = await resolveDbAccountId({ userId, account });

    const readiness = await waitUntilAutoScrapeAccountReady(
      account,
      suspendedIds,
      cycleControl,
      dbAccountId,
    );
    if (readiness !== 'ready') {
      if (isAborted(cycleControl)) return 'aborted';
      if (cycleControl?.isAccountSelected && !cycleControl.isAccountSelected(account.id)) {
        return 'aborted';
      }
      return readiness === 'busy' ? 'busy' : 'skipped';
    }
    markStart(dbAccountId);

    if (isAborted(cycleControl)) return 'aborted';
    if (cycleControl?.isAccountSelected && !cycleControl.isAccountSelected(account.id)) {
      return 'aborted';
    }

    const loginNeeded = await resolveScrapeLoginIfNeeded({ userId, account });
    if (loginNeeded) {
      onGroupsChange((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
      return 'failed';
    }

    const scrapePromise = runAutoAccountScraper({
      account,
      sessionId: account.id,
      userId,
      dbAccountId,
    });

    let cancelledBySelection = false;
    const watchTimer = window.setInterval(() => {
      if (isAborted(cycleControl)) {
        cancelledBySelection = true;
        void teardownAutoScrapeDevice({ account, dbAccountId });
        return;
      }
      if (cycleControl?.isAccountSelected && !cycleControl.isAccountSelected(account.id)) {
        cancelledBySelection = true;
        void teardownAutoScrapeDevice({ account, dbAccountId });
      }
    }, AUTO_SCRAPE_POLICY.selectionWatchMs);

    try {
      const scrapeCounts = await scrapePromise;
      if (cancelledBySelection || isAborted(cycleControl)) return 'aborted';
      if (cycleControl?.isAccountSelected && !cycleControl.isAccountSelected(account.id)) {
        return 'aborted';
      }
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
          patchBrandStandardCountForPlatform(prev, group.id, account.platform, account.id, brandX),
        );
      }

      const hint = scrapeCounts.hint ?? '';
      const truncated = /TRUNCATED_\d+/i.test(hint);
      const rolesUnverified = /UNVERIFIED_ROLES_\d+/i.test(hint);
      await recordSyncActivity({
        accountId: dbAccountId,
        platform: account.platform,
        syncSource: 'auto',
        sessionStatus: 'valid',
        deviceGroups: built.groupsCurrent,
        brandGroups: built.groupsTotal,
        adminGroups: built.adminCurrent,
        message: [
          `auto_scrape:${built.groupsCurrent}/${built.groupsTotal}`,
          truncated ? 'SCRAPER_TRUNCATED_CAP' : null,
          // Jejak permanen di riwayat sync — "bukan admin" vs "gagal diperiksa" bisa dibedakan.
          rolesUnverified ? (hint.match(/UNVERIFIED_ROLES_\d+/i)?.[0] ?? null) : null,
        ]
          .filter(Boolean)
          .join(':'),
      });

      return truncated ? 'truncated' : 'success';
    } catch (error) {
      if (cancelledBySelection || isAborted(cycleControl)) return 'aborted';
      throw error;
    } finally {
      window.clearInterval(watchTimer);
    }
  } catch (error) {
    const message = normalizeScrapeErrorMessage(
      error instanceof Error ? error.message : 'Auto scrape failed',
    );

    if (isScrapeUserCancelledMessage(message) || isAborted(cycleControl)) {
      return isAborted(cycleControl) ? 'aborted' : 'failed';
    }

    // Lane user/auto penuh — scrape tidak pernah dijalankan, jadi bukan failed.
    if (
      message.includes('AUTO_SCRAPE_USER_LANE_BUSY') ||
      message.includes('AUTO_SCRAPE_LANE_BUSY')
    ) {
      return 'busy';
    }

    if (scrapeFailureNeedsLoginModal(message)) {
      onGroupsChange((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
    }

    return 'failed';
  } finally {
    markEnd();
    await teardownAutoScrapeDevice({ account, dbAccountId: dbAccountId || undefined });
  }
}
