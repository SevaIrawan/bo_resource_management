import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AUTO_SCRAPE_POLICY, type AutoScrapeCycleControl } from '@/config/autoScrapePolicy';
import {
  formatLocalDateKey,
  msUntilNextAutoScrapeScheduleCheck,
  persistAutoScrapeLastRunDate,
  readAutoScrapeLastRunDate,
  shouldTriggerAutoScrapeCycle,
} from '@/config/autoScrapeSchedule';
import { useAutoSyncSettings } from '@/contexts/AutoSyncSettingsContext';
import { teardownAutoScrapeDevice } from '@/lib/autoScrapeDeviceTeardown';
import {
  runAutoAccountScrape,
  shouldSkipAutoScrapeAccount,
} from '@/lib/runAutoAccountScrape';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';

interface UseAutoAccountSyncOptions {
  userId: string | null | undefined;
  groups: AccountBrandGroup[];
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  enabled: boolean;
  loading: boolean;
  suspendAccountIds: string[];
}

function flattenAccounts(groups: AccountBrandGroup[]) {
  return groups.flatMap((group) =>
    group.accounts.map((account) => ({ group, account })),
  );
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
  const [activeAutoScrapeAccountId, setActiveAutoScrapeAccountId] = useState<string | null>(
    null,
  );
  const runningRef = useRef(false);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const suspendRef = useRef(suspendAccountIds);
  suspendRef.current = suspendAccountIds;
  const appStartedAtRef = useRef(new Date());
  const scheduleTimerRef = useRef<number | null>(null);
  const cycleAbortRef = useRef(false);
  const activeAutoScrapeRef = useRef<{
    account: AccountBrandRow;
    dbAccountId?: string;
  } | null>(null);

  const runCycle = useCallback(async () => {
    if (!userId || !window.electronAPI?.isElectron) return;
    if (runningRef.current) return;

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
    const cycleControl: AutoScrapeCycleControl = {
      isAborted: () => cycleAbortRef.current,
    };

    runningRef.current = true;
    setIsRunning(true);
    persistAutoScrapeLastRunDate(today);

    try {
      const entries = flattenAccounts(groupsRef.current);
      const suspended = new Set(suspendRef.current);

      for (const { group, account } of entries) {
        if (cycleControl.isAborted()) break;
        if (shouldSkipAutoScrapeAccount(account, suspended)) continue;

        const result = await runAutoAccountScrape({
          userId,
          group,
          account,
          onGroupsChange,
          cycleControl,
          suspendedIds: suspended,
          onActiveChange: (active) => {
            activeAutoScrapeRef.current = active;
            setActiveAutoScrapeAccountId(active?.account.id ?? null);
          },
        });

        if (result === 'aborted') break;

        await sleepWithAbort(AUTO_SCRAPE_POLICY.gapAfterAccountMs, cycleControl.isAborted);
      }
    } finally {
      activeAutoScrapeRef.current = null;
      setActiveAutoScrapeAccountId(null);
      runningRef.current = false;
      setIsRunning(false);
    }
  }, [onGroupsChange, scheduledHour, userId]);

  const scheduleNextCheck = useCallback(() => {
    if (scheduleTimerRef.current !== null) window.clearTimeout(scheduleTimerRef.current);

    if (!enabled || !monitoringEnabled || loading || !userId) return;
    if (!window.electronAPI?.isElectron) return;

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

      const active = activeAutoScrapeRef.current;
      if (active) {
        void teardownAutoScrapeDevice({
          account: active.account,
          dbAccountId: active.dbAccountId,
        });
        activeAutoScrapeRef.current = null;
      }
    };
  }, [scheduleNextCheck]);

  return { isRunning, activeAutoScrapeAccountId };
}
