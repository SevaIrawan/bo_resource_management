import { useEffect, useRef } from 'react';
import { TABLES } from '@/config/tables';
import { patchAccountSnapshotInGroups } from '@/lib/accountSessionPatch';
import { mergeGroupsAccountMetrics } from '@/lib/mergeMonitoringGroups';
import { patchBrandPlatformMasterInGroups } from '@/lib/patchAccountMasterInGroups';
import { getSupabase } from '@/lib/supabase';
import type { AccountSnapshot } from '@/types/database';
import type { Platform } from '@/types/database';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Dispatch, SetStateAction } from 'react';

interface UseRealtimeMonitoringOptions {
  userId: string | null;
  enabled: boolean;
  suspendAccountIds?: string[];
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  onAccountDailyChanged?: (accountId: string) => void;
  onRegistryChange: () => void;
  onDataChangeNotice?: () => void;
  onMasterDataChanged?: () => void;
  /** new_register berubah → refresh Avg ND di tab Operations. */
  onOperationsMetricsChanged?: () => void;
}

type GroupsMasterRow = {
  brand?: string;
  platform?: Platform;
};

type DailyRow = {
  account_id?: string;
  brand?: string;
  platform?: Platform;
};

function brandPlatformKey(brand: string, platform: Platform): string {
  return `${brand.trim()}|${platform}`;
}

export function useRealtimeMonitoring({
  userId,
  enabled,
  suspendAccountIds = [],
  onGroupsChange,
  onAccountDailyChanged,
  onRegistryChange,
  onDataChangeNotice,
  onMasterDataChanged,
  onOperationsMetricsChanged,
}: UseRealtimeMonitoringOptions) {
  const onGroupsChangeRef = useRef(onGroupsChange);
  const onAccountDailyChangedRef = useRef(onAccountDailyChanged);
  const onRegistryChangeRef = useRef(onRegistryChange);
  const onDataChangeNoticeRef = useRef(onDataChangeNotice);
  const onMasterDataChangedRef = useRef(onMasterDataChanged);
  const onOperationsMetricsChangedRef = useRef(onOperationsMetricsChanged);
  const suspendedRef = useRef(suspendAccountIds);
  /** Pending master keys + flush — hidup lintas effect agar unsuspend bisa retry. */
  const pendingBrandPlatformRef = useRef(new Set<string>());
  const flushMasterPatchesRef = useRef<(() => void) | null>(null);

  onGroupsChangeRef.current = onGroupsChange;
  onAccountDailyChangedRef.current = onAccountDailyChanged;
  onRegistryChangeRef.current = onRegistryChange;
  onDataChangeNoticeRef.current = onDataChangeNotice;
  onMasterDataChangedRef.current = onMasterDataChanged;
  onOperationsMetricsChangedRef.current = onOperationsMetricsChanged;
  suspendedRef.current = suspendAccountIds;

  const notifyChange = () => {
    onDataChangeNoticeRef.current?.();
  };

  /** Saat akun unsuspend, coba flush master yang ditunda karena skip suspend. */
  useEffect(() => {
    if (pendingBrandPlatformRef.current.size === 0) return;
    flushMasterPatchesRef.current?.();
  }, [suspendAccountIds]);

  useEffect(() => {
    if (!enabled || !userId) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const pendingBrandPlatform = pendingBrandPlatformRef.current;
    let masterFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let masterFlushInFlight = false;

    const readGroupsSnapshot = (): Promise<AccountBrandGroup[]> =>
      new Promise((resolve) => {
        onGroupsChangeRef.current((current) => {
          resolve(current);
          return current;
        });
      });

    const scheduleRetryFlush = (delayMs: number) => {
      if (masterFlushTimer) clearTimeout(masterFlushTimer);
      masterFlushTimer = setTimeout(() => {
        masterFlushTimer = null;
        void flushMasterPatches();
      }, delayMs);
    };

    const flushMasterPatches = async () => {
      if (masterFlushInFlight) return;
      const keys = [...pendingBrandPlatform];
      if (!keys.length) return;
      pendingBrandPlatform.clear();

      masterFlushInFlight = true;
      let deferredAny = false;
      try {
        let working = await readGroupsSnapshot();
        let didPatch = false;
        for (const key of keys) {
          const sep = key.indexOf('|');
          if (sep < 0) continue;
          const brand = key.slice(0, sep);
          const platform = key.slice(sep + 1) as Platform;
          if (platform !== 'whatsapp' && platform !== 'telegram') continue;
          const hasSuspended = working.some((g) =>
            g.brandName.trim() === brand.trim()
              ? g.accounts.some(
                  (a) =>
                    a.platform === platform && suspendedRef.current.includes(a.id),
                )
              : false,
          );
          if (hasSuspended) {
            pendingBrandPlatform.add(key);
            deferredAny = true;
            continue;
          }
          working = await patchBrandPlatformMasterInGroups(working, brand, platform);
          didPatch = true;
        }
        if (didPatch) {
          const patched = working;
          onGroupsChangeRef.current((current) => mergeGroupsAccountMetrics(current, patched));
          onMasterDataChangedRef.current?.();
          notifyChange();
        }
      } finally {
        masterFlushInFlight = false;
        if (pendingBrandPlatform.size > 0) {
          // Suspend masih aktif → retry; delay cukup untuk unsuspend scrape selesai.
          scheduleRetryFlush(deferredAny ? 600 : 0);
        }
      }
    };

    flushMasterPatchesRef.current = () => {
      scheduleRetryFlush(0);
    };

    const scheduleBrandPlatformPatch = (brand: string, platform: Platform) => {
      const key = brandPlatformKey(brand, platform);
      if (!key || key === '|') return;
      pendingBrandPlatform.add(key);
      scheduleRetryFlush(400);
    };

    const handleMasterChange = (row: GroupsMasterRow | undefined) => {
      const brand = row?.brand?.trim();
      const platform = row?.platform;
      if (!brand || (platform !== 'whatsapp' && platform !== 'telegram')) return;
      scheduleBrandPlatformPatch(brand, platform);
    };

    const channel = supabase
      .channel(`rm-monitoring-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.accountSnapshots },
        (payload) => {
          const row = (payload.new ?? payload.old) as AccountSnapshot | undefined;
          if (!row?.account_id) return;
          if (suspendedRef.current.includes(row.account_id)) return;

          onGroupsChangeRef.current((prev) => patchAccountSnapshotInGroups(prev, row));
          notifyChange();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.brands },
        () => {
          onRegistryChangeRef.current();
          notifyChange();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.messagingAccounts },
        () => {
          onRegistryChangeRef.current();
          notifyChange();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.scrapeRuns },
        () => {
          notifyChange();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.groupsMaster },
        (payload) => {
          handleMasterChange((payload.new ?? payload.old) as GroupsMasterRow | undefined);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.newRegister },
        () => {
          onOperationsMetricsChangedRef.current?.();
          notifyChange();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.groupScrapeDaily },
        (payload) => {
          const row = (payload.new ?? payload.old) as DailyRow | undefined;
          const accountId = row?.account_id;
          if (!accountId || suspendedRef.current.includes(accountId)) return;

          // patchAccountGridAfterDailyWrite sudah patch daily + master; jangan double-patch master di sini.
          onAccountDailyChangedRef.current?.(accountId);
          notifyChange();
        },
      )
      .subscribe();

    return () => {
      if (masterFlushTimer) clearTimeout(masterFlushTimer);
      flushMasterPatchesRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);
}
