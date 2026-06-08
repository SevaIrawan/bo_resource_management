import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAutoSyncSettings } from '@/contexts/AutoSyncSettingsContext';
import { upsertAccountSnapshot } from '@/lib/accountSnapshots';
import {
  applySyncCheckToGroup,
  runAccountSyncCheck,
} from '@/lib/runAutoSyncAccount';
import { sessionCheckTimeoutMs, syncDetectTimeoutMs } from '@/config/syncScraperPolicy';
import { withTimeout } from '@/lib/withTimeout';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

const DELAY_BETWEEN_ACCOUNTS_MS = 4_000;
const INITIAL_DELAY_MS = 8_000;
/** Probe 3s + detect 90s + buffer DB. */
const AUTO_SYNC_ACCOUNT_TIMEOUT_MS =
  sessionCheckTimeoutMs() + syncDetectTimeoutMs() + 15_000;

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

export function useAutoAccountSync({
  userId,
  groups,
  onGroupsChange,
  enabled: monitoringEnabled,
  loading,
  suspendAccountIds,
}: UseAutoAccountSyncOptions) {
  const { enabled, intervalMs } = useAutoSyncSettings();
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const suspendRef = useRef(suspendAccountIds);
  suspendRef.current = suspendAccountIds;

  const runCycle = useCallback(async () => {
    if (!userId || !window.electronAPI?.isElectron) return;
    if (runningRef.current) return;

    runningRef.current = true;
    setIsRunning(true);

    try {
      const entries = flattenAccounts(groupsRef.current);
      const suspended = new Set(suspendRef.current);

      for (const { group, account } of entries) {
        if (suspended.has(account.id)) continue;

        const output = await withTimeout(
          runAccountSyncCheck({
            userId,
            group,
            account,
            syncSource: 'auto',
          }),
          AUTO_SYNC_ACCOUNT_TIMEOUT_MS,
          `Auto-sync ${account.accountName}`,
        ).catch(() => null);

        if (!output) continue;

        onGroupsChange((prev) =>
          prev.map((g) =>
            g.id === group.id ? applySyncCheckToGroup(g, account.id, output) : g,
          ),
        );

        if (group.dbBrandId) {
          const brandStandard =
            group.standardGroupCountByPlatform?.[account.platform] ??
            output.result.groupsTotal;
          await upsertAccountSnapshot({
            account: {
              ...account,
              ...output.result,
              status: output.result.sessionStatus === 'valid' ? 'active' : 'logout',
              sessionStatus: output.result.sessionStatus,
            },
            brandId: group.dbBrandId,
            result: output.result,
            brandStandard,
            masterTotal: output.masterJoined,
          });
        }

        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_ACCOUNTS_MS));
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, [onGroupsChange, userId]);

  useEffect(() => {
    if (!enabled || !monitoringEnabled || loading || !userId) return;
    if (!window.electronAPI?.isElectron) return;

    const startTimer = window.setTimeout(() => {
      void runCycle();
    }, INITIAL_DELAY_MS);

    const intervalId = window.setInterval(() => {
      void runCycle();
    }, intervalMs);

    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs, loading, monitoringEnabled, runCycle, userId]);

  return { isRunning };
}
