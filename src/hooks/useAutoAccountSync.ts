import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AUTO_SCRAPE_POLICY, type AutoScrapeCycleControl } from '@/config/autoScrapePolicy';
import {
  filterAccountsByAutoScrapeSelection,
  getAutoScrapeBrandAccountSelection,
  getMaxAutoScrapeBrandSlotsPerPlatform,
  isAutoScrapeBrandEnabled,
  readAutoScrapeBrandAccounts,
  readAutoScrapeBrandToggles,
  setAutoScrapeBrandAccountResults,
  type AutoScrapeBrandAccountMap,
  type AutoScrapeBrandAccountResultRow,
  type AutoScrapeBrandToggleMap,
} from '@/config/autoScrapeBrandSettings';
import {
  formatLocalDateKey,
  msUntilNextAutoScrapeScheduleCheck,
  persistAutoScrapeLastRunDate,
  readAutoScrapeLastRunDate,
  shouldTriggerAutoScrapeCycle,
} from '@/config/autoScrapeSchedule';
import {
  AUTO_SCRAPE_NOW_RUN_EVENT,
  readAutoScrapeNowEnabled,
} from '@/config/autoScrapeNowSettings';
import { readAutoSyncEnabled } from '@/config/autoSyncSettings';
import { useAutoSyncSettings } from '@/contexts/AutoSyncSettingsContext';
import { teardownAutoScrapeDevice } from '@/lib/autoScrapeDeviceTeardown';
import {
  runAutoAccountScrape,
  shouldSkipAutoScrapeAccount,
  type AutoScrapeAccountResult,
  type AutoScrapeActiveEvent,
} from '@/lib/runAutoAccountScrape';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

interface UseAutoAccountSyncOptions {
  userId: string | null | undefined;
  groups: AccountBrandGroup[];
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  enabled: boolean;
  loading: boolean;
  suspendAccountIds: string[];
}

type ActiveAutoScrapeEntry = {
  account: AccountBrandRow;
  dbAccountId?: string;
};

/** Target cycle: hanya brand ON + Acc terpilih (bukan semua akun grid). */
export function collectAutoScrapeTargets(input: {
  groups: AccountBrandGroup[];
  toggles: AutoScrapeBrandToggleMap;
  accountSelections: AutoScrapeBrandAccountMap;
  maxBrandSlots: number;
}): Record<Platform, Array<{ group: AccountBrandGroup; accounts: AccountBrandRow[] }>> {
  const selectedByPlatform: Record<
    Platform,
    Array<{ group: AccountBrandGroup; accounts: AccountBrandRow[] }>
  > = {
    whatsapp: [],
    telegram: [],
  };

  for (const group of input.groups) {
    const byPlatform: Record<Platform, AccountBrandRow[]> = {
      whatsapp: [],
      telegram: [],
    };
    for (const account of group.accounts) {
      byPlatform[account.platform].push(account);
    }

    for (const platform of ['whatsapp', 'telegram'] as const) {
      const accounts = byPlatform[platform];
      if (accounts.length === 0) continue;
      if (!isAutoScrapeBrandEnabled(platform, group.brandName, input.toggles)) continue;
      const selection = getAutoScrapeBrandAccountSelection(
        platform,
        group.brandName,
        input.accountSelections,
      );
      const filtered = filterAccountsByAutoScrapeSelection(accounts, selection);
      if (filtered.length === 0) continue;
      selectedByPlatform[platform].push({ group, accounts: filtered });
    }
  }

  for (const platform of ['whatsapp', 'telegram'] as const) {
    selectedByPlatform[platform] = selectedByPlatform[platform].slice(0, input.maxBrandSlots);
  }

  return selectedByPlatform;
}

/** Brand + Acc masih aktif di Settings (re-cek mid-cycle). */
function isBrandAccountStillSelected(
  platform: Platform,
  brandName: string,
  accountId: string,
  opts?: { requireScheduledMaster?: boolean },
): boolean {
  if (opts?.requireScheduledMaster !== false && !readAutoSyncEnabled()) return false;
  const toggles = readAutoScrapeBrandToggles();
  if (!isAutoScrapeBrandEnabled(platform, brandName, toggles)) return false;
  const selection = getAutoScrapeBrandAccountSelection(
    platform,
    brandName,
    readAutoScrapeBrandAccounts(),
  );
  if (selection === 'all') return true;
  return selection.includes(accountId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function sleepWithAbort(ms: number, isAborted: () => boolean): Promise<void> {
  const step = 500;
  let remaining = ms;
  while (remaining > 0) {
    if (isAborted()) return;
    const chunk = Math.min(step, remaining);
    await sleep(chunk);
    remaining -= chunk;
  }
}

function mapAccountResultToOutcome(
  result: AutoScrapeAccountResult,
): AutoScrapeBrandAccountResultRow['outcome'] | null {
  if (result === 'success') return 'success';
  if (result === 'failed') return 'failed';
  if (result === 'skipped') return 'session_invalid';
  return null; // aborted — jangan catat sebagai failed
}

/** Akun satu brand + satu platform, berurutan.
 * Session invalid / gagal → catat outcome, jeda, lanjut Acc berikutnya (jangan stop brand).
 */
async function runBrandPlatformSequential(input: {
  userId: string;
  group: AccountBrandGroup;
  platform: Platform;
  accounts: AccountBrandRow[];
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  cycleControl: AutoScrapeCycleControl;
  suspended: Set<string>;
  onActiveChange: (event: AutoScrapeActiveEvent) => void;
  /** `now` = jangan wajib On Scheduled master. */
  mode?: 'scheduled' | 'now';
}): Promise<'ok' | 'aborted'> {
  const accountRows: AutoScrapeBrandAccountResultRow[] = [];
  const requireScheduledMaster = input.mode !== 'now';

  for (const account of input.accounts) {
    if (input.cycleControl.isAborted()) {
      persistBrandAccountResults(input.platform, input.group.brandName, accountRows);
      return 'aborted';
    }

    // Settings berubah mid-cycle (Enabled/brand/Acc OFF) — lewati tanpa jeda scrape.
    if (
      !isBrandAccountStillSelected(input.platform, input.group.brandName, account.id, {
        requireScheduledMaster,
      })
    ) {
      continue;
    }

    if (shouldSkipAutoScrapeAccount(account, input.suspended)) {
      accountRows.push({
        accountId: account.id,
        accountName: account.accountName,
        outcome: 'session_invalid',
      });
      await sleepWithAbort(AUTO_SCRAPE_POLICY.gapAfterAccountMs, input.cycleControl.isAborted);
      continue;
    }

    const result = await runAutoAccountScrape({
      userId: input.userId,
      group: input.group,
      account,
      onGroupsChange: input.onGroupsChange,
      cycleControl: input.cycleControl,
      suspendedIds: input.suspended,
      onActiveChange: input.onActiveChange,
    });

    const outcome = mapAccountResultToOutcome(result);
    if (outcome) {
      accountRows.push({
        accountId: account.id,
        accountName: account.accountName,
        outcome,
      });
    }

    if (result === 'aborted') {
      persistBrandAccountResults(input.platform, input.group.brandName, accountRows);
      return 'aborted';
    }

    // success | failed | skipped(session_invalid dari runner) → jeda lalu Acc berikutnya
    await sleepWithAbort(AUTO_SCRAPE_POLICY.gapAfterAccountMs, input.cycleControl.isAborted);
  }

  persistBrandAccountResults(input.platform, input.group.brandName, accountRows);
  return 'ok';
}

function persistBrandAccountResults(
  platform: Platform,
  brandName: string,
  accounts: AutoScrapeBrandAccountResultRow[],
): void {
  if (accounts.length === 0) return;
  setAutoScrapeBrandAccountResults(platform, brandName, accounts);
}

export function useAutoAccountSync({
  userId,
  groups,
  onGroupsChange,
  enabled: monitoringEnabled,
  loading,
  suspendAccountIds,
}: UseAutoAccountSyncOptions) {
  const { enabled, scheduledHour } = useAutoSyncSettings();
  const [isRunning, setIsRunning] = useState(false);
  /** Semua akun yang sedang auto scrape (brand paralel) — untuk suspend probe realtime. */
  const [activeAutoScrapeAccountIds, setActiveAutoScrapeAccountIds] = useState<string[]>([]);
  const runningRef = useRef(false);
  const cycleModeRef = useRef<'idle' | 'scheduled' | 'now'>('idle');
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const suspendRef = useRef(suspendAccountIds);
  suspendRef.current = suspendAccountIds;
  const appStartedAtRef = useRef(new Date());
  const scheduleTimerRef = useRef<number | null>(null);
  const cycleAbortRef = useRef(false);
  /** Parallel-safe: satu entry per accountId. */
  const activeAutoScrapeRef = useRef<Map<string, ActiveAutoScrapeEntry>>(new Map());

  const syncActiveIdsState = useCallback(() => {
    setActiveAutoScrapeAccountIds([...activeAutoScrapeRef.current.keys()]);
  }, []);

  const handleActiveChange = useCallback(
    (event: AutoScrapeActiveEvent) => {
      if (event.kind === 'start') {
        activeAutoScrapeRef.current.set(event.account.id, {
          account: event.account,
          dbAccountId: event.dbAccountId,
        });
      } else {
        activeAutoScrapeRef.current.delete(event.accountId);
      }
      syncActiveIdsState();
    },
    [syncActiveIdsState],
  );

  const teardownAllActive = useCallback(async () => {
    const entries = [...activeAutoScrapeRef.current.values()];
    activeAutoScrapeRef.current.clear();
    syncActiveIdsState();
    await Promise.all(
      entries.map((entry) =>
        teardownAutoScrapeDevice({
          account: entry.account,
          dbAccountId: entry.dbAccountId,
        }),
      ),
    );
  }, [syncActiveIdsState]);

  const runSelectedBrands = useCallback(
    async (mode: 'scheduled' | 'now') => {
      if (!userId) return;
      const toggles = readAutoScrapeBrandToggles();
      const accountSelections = readAutoScrapeBrandAccounts();
      const suspended = new Set(suspendRef.current);
      const maxBrandSlots = getMaxAutoScrapeBrandSlotsPerPlatform();
      const selectedByPlatform = collectAutoScrapeTargets({
        groups: groupsRef.current,
        toggles,
        accountSelections,
        maxBrandSlots,
      });

      const cycleControl: AutoScrapeCycleControl = {
        isAborted: () => {
          if (cycleAbortRef.current) return true;
          if (mode === 'scheduled' && !readAutoSyncEnabled()) return true;
          if (mode === 'now' && !readAutoScrapeNowEnabled()) return true;
          return false;
        },
      };

      const brandTasks: Array<Promise<'ok' | 'aborted'>> = [];
      for (const platform of ['whatsapp', 'telegram'] as const) {
        for (const row of selectedByPlatform[platform]) {
          brandTasks.push(
            runBrandPlatformSequential({
              userId,
              group: row.group,
              platform,
              accounts: row.accounts,
              onGroupsChange,
              cycleControl,
              suspended,
              onActiveChange: handleActiveChange,
              mode,
            }),
          );
        }
      }

      if (brandTasks.length === 0) return;
      await Promise.all(brandTasks);
    },
    [handleActiveChange, onGroupsChange, userId],
  );

  const runCycle = useCallback(async () => {
    if (!userId || !window.electronAPI?.isElectron) return;
    if (runningRef.current) return;

    // Gate ketat: Settings On Scheduled + permission monitoring (bukan hanya timer).
    if (!readAutoSyncEnabled() || !monitoringEnabled) return;

    const now = new Date();
    const today = formatLocalDateKey(now);
    const lastRunDate = readAutoScrapeLastRunDate();

    if (
      !shouldTriggerAutoScrapeCycle({
        now,
        appStartedAt: appStartedAtRef.current,
        scheduledHour,
        lastRunDate,
      })
    ) {
      return;
    }

    cycleAbortRef.current = false;
    cycleModeRef.current = 'scheduled';
    runningRef.current = true;
    setIsRunning(true);
    persistAutoScrapeLastRunDate(today);

    try {
      await runSelectedBrands('scheduled');
    } finally {
      activeAutoScrapeRef.current.clear();
      syncActiveIdsState();
      runningRef.current = false;
      cycleModeRef.current = 'idle';
      setIsRunning(false);
    }
  }, [
    monitoringEnabled,
    runSelectedBrands,
    scheduledHour,
    syncActiveIdsState,
    userId,
  ]);

  /** Scrape Now: skip gate jam / lastRunDate; jangan kunci jadwal harian. */
  const runNowCycle = useCallback(async () => {
    if (!userId || !window.electronAPI?.isElectron) return;
    if (runningRef.current) return;
    if (!monitoringEnabled) return;
    if (!readAutoScrapeNowEnabled()) return;

    cycleAbortRef.current = false;
    cycleModeRef.current = 'now';
    runningRef.current = true;
    setIsRunning(true);

    try {
      await runSelectedBrands('now');
    } finally {
      activeAutoScrapeRef.current.clear();
      syncActiveIdsState();
      runningRef.current = false;
      cycleModeRef.current = 'idle';
      setIsRunning(false);
    }
  }, [monitoringEnabled, runSelectedBrands, syncActiveIdsState, userId]);

  const scheduleNextCheck = useCallback(() => {
    if (scheduleTimerRef.current !== null) window.clearTimeout(scheduleTimerRef.current);

    if (!enabled || !monitoringEnabled || loading || !userId) return;
    if (!window.electronAPI?.isElectron) return;
    if (!readAutoSyncEnabled()) return;

    const delay = msUntilNextAutoScrapeScheduleCheck(new Date(), scheduledHour);
    scheduleTimerRef.current = window.setTimeout(() => {
      void runCycle().finally(() => {
        scheduleNextCheck();
      });
    }, delay);
  }, [enabled, loading, monitoringEnabled, runCycle, scheduledHour, userId]);

  useEffect(() => {
    appStartedAtRef.current = new Date();
    cycleAbortRef.current = false;
    scheduleNextCheck();

    return () => {
      cycleAbortRef.current = true;

      if (scheduleTimerRef.current !== null) {
        window.clearTimeout(scheduleTimerRef.current);
        scheduleTimerRef.current = null;
      }

      void teardownAllActive();
    };
  }, [scheduleNextCheck, teardownAllActive]);

  // On Scheduled OFF → abort hanya cycle jadwal (bukan Scrape Now).
  useEffect(() => {
    if (enabled) return;
    if (cycleModeRef.current !== 'scheduled') return;
    cycleAbortRef.current = true;
    if (runningRef.current || activeAutoScrapeRef.current.size > 0) {
      void teardownAllActive();
    }
  }, [enabled, teardownAllActive]);

  useEffect(() => {
    const onScrapeNow = () => {
      void runNowCycle();
    };
    window.addEventListener(AUTO_SCRAPE_NOW_RUN_EVENT, onScrapeNow);
    return () => window.removeEventListener(AUTO_SCRAPE_NOW_RUN_EVENT, onScrapeNow);
  }, [runNowCycle]);

  return { isRunning, activeAutoScrapeAccountIds };
}
