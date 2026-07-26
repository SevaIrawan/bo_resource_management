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
  AUTO_SCRAPE_NOW_CHANGED_EVENT,
  registerAutoScrapeNowRunner,
  readAutoScrapeNowEnabled,
  setAutoScrapeCycleRunning,
  type AutoScrapeNowRunResult,
} from '@/config/autoScrapeNowSettings';
import { resetAutoScrapeToFactoryDefaults } from '@/config/autoScrapeDefaults';
import {
  AUTO_SYNC_ENABLED_CHANGED_EVENT,
  readAutoSyncEnabled,
} from '@/config/autoSyncSettings';
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

type CycleMode = 'scheduled' | 'now';

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
export function isBrandAccountStillSelected(
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
  if (result === 'truncated') return 'truncated';
  if (result === 'failed') return 'failed';
  if (result === 'skipped') return 'session_invalid';
  return null;
}

function persistBrandAccountResults(
  platform: Platform,
  brandName: string,
  accounts: AutoScrapeBrandAccountResultRow[],
): void {
  if (accounts.length === 0) return;
  setAutoScrapeBrandAccountResults(platform, brandName, accounts);
}

/** Akun satu brand + satu platform, berurutan. */
async function runBrandPlatformSequential(input: {
  userId: string;
  group: AccountBrandGroup;
  platform: Platform;
  accounts: AccountBrandRow[];
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  cycleControl: AutoScrapeCycleControl;
  suspended: Set<string>;
  onActiveChange: (event: AutoScrapeActiveEvent) => void;
  mode: CycleMode;
}): Promise<'ok' | 'aborted'> {
  const accountRows: AutoScrapeBrandAccountResultRow[] = [];
  const requireScheduledMaster = input.mode !== 'now';

  for (const account of input.accounts) {
    if (input.cycleControl.isAborted()) {
      persistBrandAccountResults(input.platform, input.group.brandName, accountRows);
      return 'aborted';
    }

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
      cycleControl: {
        ...input.cycleControl,
        isAccountSelected: (accountId) =>
          isBrandAccountStillSelected(input.platform, input.group.brandName, accountId, {
            requireScheduledMaster,
          }),
      },
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

    await sleepWithAbort(AUTO_SCRAPE_POLICY.gapAfterAccountMs, input.cycleControl.isAborted);
  }

  persistBrandAccountResults(input.platform, input.group.brandName, accountRows);
  return 'ok';
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
  const [activeAutoScrapeAccountIds, setActiveAutoScrapeAccountIds] = useState<string[]>([]);
  const runningRef = useRef(false);
  const cycleModeRef = useRef<'idle' | CycleMode>('idle');
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const suspendRef = useRef(suspendAccountIds);
  suspendRef.current = suspendAccountIds;
  const appStartedAtRef = useRef(new Date());
  const scheduleTimerRef = useRef<number | null>(null);
  const cycleAbortRef = useRef(false);
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

  const abortCycleIfMode = useCallback(
    (mode: CycleMode) => {
      if (cycleModeRef.current !== mode) return;
      cycleAbortRef.current = true;
      if (runningRef.current || activeAutoScrapeRef.current.size > 0) {
        void teardownAllActive();
      }
    },
    [teardownAllActive],
  );

  const runSelectedBrands = useCallback(
    async (mode: CycleMode): Promise<number> => {
      if (!userId) return 0;
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
      let targetCount = 0;
      for (const platform of ['whatsapp', 'telegram'] as const) {
        for (const row of selectedByPlatform[platform]) {
          targetCount += 1;
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

      if (brandTasks.length === 0) return 0;
      await Promise.all(brandTasks);
      return targetCount;
    },
    [handleActiveChange, onGroupsChange, userId],
  );

  /** Satu pintu cycle — scheduled & now, tanpa duplicate start/finally. */
  const runAutoScrapeCycle = useCallback(
    async (mode: CycleMode): Promise<AutoScrapeNowRunResult | { ok: true } | { ok: false; reason: 'busy' | 'disabled' | 'not_ready' | 'no_targets' }> => {
      if (!userId || !window.electronAPI?.isElectron) {
        return { ok: false, reason: 'not_ready' };
      }
      if (!monitoringEnabled) return { ok: false, reason: 'not_ready' };
      if (runningRef.current) return { ok: false, reason: 'busy' };

      if (mode === 'scheduled') {
        if (!readAutoSyncEnabled()) return { ok: false, reason: 'disabled' };
        const now = new Date();
        if (
          !shouldTriggerAutoScrapeCycle({
            now,
            appStartedAt: appStartedAtRef.current,
            scheduledHour,
            lastRunDate: readAutoScrapeLastRunDate(),
          })
        ) {
          return { ok: false, reason: 'disabled' };
        }
      } else if (!readAutoScrapeNowEnabled()) {
        return { ok: false, reason: 'disabled' };
      }

      cycleAbortRef.current = false;
      cycleModeRef.current = mode;
      runningRef.current = true;
      setIsRunning(true);
      setAutoScrapeCycleRunning(true, mode);

      let targetCount = 0;
      try {
        targetCount = await runSelectedBrands(mode);
        if (targetCount === 0) return { ok: false, reason: 'no_targets' };
        return { ok: true };
      } finally {
        // Jadwal: kunci hari setelah cycle dijalankan (ada target), termasuk abort mid-cycle.
        if (mode === 'scheduled' && targetCount > 0) {
          persistAutoScrapeLastRunDate(formatLocalDateKey(new Date()));
        }
        activeAutoScrapeRef.current.clear();
        syncActiveIdsState();
        // Idle dulu supaya listener Scrape Now OFF tidak abort/teardown cycle yang sudah selesai.
        runningRef.current = false;
        cycleModeRef.current = 'idle';
        setIsRunning(false);
        setAutoScrapeCycleRunning(false, 'idle');
        // Scrape Now selesai (sukses/gagal) → factory defaults (On Scheduled On, Scrape Now Off, 6 brand).
        if (mode === 'now') {
          resetAutoScrapeToFactoryDefaults();
        }
      }
    },
    [monitoringEnabled, runSelectedBrands, scheduledHour, syncActiveIdsState, userId],
  );

  const runCycle = useCallback(async () => {
    await runAutoScrapeCycle('scheduled');
  }, [runAutoScrapeCycle]);

  const runNowCycle = useCallback(async (): Promise<AutoScrapeNowRunResult> => {
    return runAutoScrapeCycle('now');
  }, [runAutoScrapeCycle]);

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

  // On Scheduled OFF → abort + teardown (same-tab + storage).
  useEffect(() => {
    if (!enabled) abortCycleIfMode('scheduled');
  }, [abortCycleIfMode, enabled]);

  useEffect(() => {
    const onScheduledChanged = (event: Event) => {
      const enabledNext =
        event instanceof CustomEvent && typeof event.detail?.enabled === 'boolean'
          ? event.detail.enabled
          : readAutoSyncEnabled();
      if (!enabledNext) abortCycleIfMode('scheduled');
    };
    window.addEventListener(AUTO_SYNC_ENABLED_CHANGED_EVENT, onScheduledChanged);
    return () => window.removeEventListener(AUTO_SYNC_ENABLED_CHANGED_EVENT, onScheduledChanged);
  }, [abortCycleIfMode]);

  // Scrape Now OFF → abort + teardown (setara On Scheduled).
  useEffect(() => {
    const onNowChanged = (event: Event) => {
      const enabledNext =
        event instanceof CustomEvent && typeof event.detail?.enabled === 'boolean'
          ? event.detail.enabled
          : readAutoScrapeNowEnabled();
      if (!enabledNext) abortCycleIfMode('now');
    };
    window.addEventListener(AUTO_SCRAPE_NOW_CHANGED_EVENT, onNowChanged);
    return () => window.removeEventListener(AUTO_SCRAPE_NOW_CHANGED_EVENT, onNowChanged);
  }, [abortCycleIfMode]);

  useEffect(() => {
    registerAutoScrapeNowRunner(() => runNowCycle());
    return () => registerAutoScrapeNowRunner(null);
  }, [runNowCycle]);

  return { isRunning, activeAutoScrapeAccountIds };
}
