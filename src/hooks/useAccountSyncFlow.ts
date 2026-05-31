import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import {
  applySyncResultToGroup,
  rebuildGroupMetrics,
  setAccountProcessAction,
  type AccountSyncResult,
} from '@/lib/accountBrandUtils';
import { todayScrapeDate } from '@/lib/accountMonitoringEngine';
import { upsertAccountSnapshot } from '@/lib/accountSnapshots';
import {
  buildMetricsFromScrapeDaily,
  fetchHasDailyData,
  fetchMasterGroupStats,
} from '@/lib/accountSyncData';
import { resolveBrandStandardTotal } from '@/lib/brandStandardCount';
import {
  reconcileTicketsAfterScrape,
  reconcileTicketsForAccount,
} from '@/lib/reconcileTickets';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import { resolveMessagingAccountId } from '@/lib/accountScraper';
import { runAccountScraper } from '@/lib/runAccountScraper';
import { hasActivePlatformSession } from '@/lib/platformSessions';
import { accountNeedsRelogin } from '@/lib/platformSyncCopy';
import { refreshAccountMetrics } from '@/lib/accountMonitoringEngine';
import { syncResultForInvalidSession } from '@/lib/accountSessionUi';
import { warmSessionIfStored } from '@/lib/warmPlatformSession';
import { markAccountLoginGrace } from '@/lib/sessionRealtimePolicy';
import { getErrorMessage } from '@/lib/errorMessage';
import { PHONE_COLUMN_MIGRATION_HINT } from '@/lib/dbPhoneSchema';
import { hasValidAccountPhone, updateMessagingAccountPhone } from '@/lib/accountPhone';
import { persistLoginSessionAfterSuccess } from '@/lib/persistLoginSession';
import { probePlatformSession } from '@/lib/sessionProbe';
import { withTimeout } from '@/lib/withTimeout';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

const SYNC_WARM_TIMEOUT_MS = 15_000;
const SYNC_PROBE_TIMEOUT_MS = 25_000;

export type SyncFlowStep =
  | 'idle'
  | 'missing-phone'
  | 'sync-error'
  | 'session-valid'
  | 'session-invalid'
  | 'confirm-scrape'
  | 'scrape-prompt'
  | 'platform-login';

interface SyncTarget {
  groupId: string;
  account: AccountBrandRow;
}

interface UseAccountSyncFlowOptions {
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  userId?: string | null;
  onTicketsReload?: () => void;
}

function patchGroup(
  groups: AccountBrandGroup[],
  groupId: string,
  patcher: (group: AccountBrandGroup) => AccountBrandGroup,
): AccountBrandGroup[] {
  return groups.map((group) => (group.id === groupId ? patcher(group) : group));
}

function patchAccountPhone(
  groups: AccountBrandGroup[],
  groupId: string,
  accountId: string,
  phoneNumber: string,
): AccountBrandGroup[] {
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    return {
      ...group,
      accounts: group.accounts.map((row) =>
        row.id === accountId ? { ...row, phoneNumber } : row,
      ),
    };
  });
}

function normalizeSyncErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('phone_or_username') || (lower.includes('phone_number') && lower.includes('42703'))) {
    return PHONE_COLUMN_MIGRATION_HINT;
  }
  return message;
}

export function useAccountSyncFlow({
  onGroupsChange,
  userId,
  onTicketsReload,
}: UseAccountSyncFlowOptions) {
  const [processingAccountId, setProcessingAccountId] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<'sync' | 'scraper' | null>(null);
  const [postLoginGraceAccountId, setPostLoginGraceAccountId] = useState<string | null>(null);
  const [step, setStep] = useState<SyncFlowStep>('idle');
  const [target, setTarget] = useState<SyncTarget | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [loginIntent, setLoginIntent] = useState<'sync' | 'scraper' | null>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);

  const updateGroups = useCallback(
    (patcher: (groups: AccountBrandGroup[]) => AccountBrandGroup[]) => {
      onGroupsChange((prev) => patcher(prev));
    },
    [onGroupsChange],
  );

  /** Modal login langsung — tidak ada warm/purge yang blok UI. */
  const showLoginModal = useCallback(
    (
      groupId: string,
      account: AccountBrandRow,
      intent: 'sync' | 'scraper',
      message: string,
    ) => {
      setTarget({ groupId, account });
      setLoginIntent(intent);
      setSyncMessage(message);
      setCheckError(null);
      setStep('platform-login');
    },
    [],
  );

  const closeFlow = useCallback(() => {
    setStep('idle');
    setTarget(null);
    setCheckError(null);
    setSyncMessage(null);
    setLoginIntent(null);
    setProcessingAccountId(null);
    setProcessingAction(null);
  }, []);

  const setRowProcessing = useCallback(
    (groupId: string, accountId: string, action: 'sync' | 'scraper') => {
      setProcessingAccountId(accountId);
      setProcessingAction(action);
      updateGroups((groups) =>
        patchGroup(groups, groupId, (group) => setAccountProcessAction(group, accountId, action)),
      );
    },
    [updateGroups],
  );

  const clearRowProcessing = useCallback(
    (groupId: string, accountId: string) => {
      setProcessingAccountId(null);
      setProcessingAction(null);
      updateGroups((groups) =>
        patchGroup(groups, groupId, (group) => setAccountProcessAction(group, accountId, null)),
      );
    },
    [updateGroups],
  );

  const applyResult = useCallback(
    async (
      groupId: string,
      accountId: string,
      result: AccountSyncResult,
      meta?: { masterTotal?: number },
    ) => {
      const snapshotPending: Array<{
        account: AccountBrandRow;
        brandId: string;
        brandStandard: number;
      }> = [];

      updateGroups((prev) => {
        const group = prev.find((g) => g.id === groupId);
        const account = group?.accounts.find((r) => r.id === accountId);
        const brandStandard =
          (group &&
            account &&
            (group.standardGroupCountByPlatform?.[account.platform] ??
              account.groupsTotal)) ??
          account?.groupsTotal ??
          0;

        if (group?.dbBrandId && account) {
          snapshotPending.push({
            account,
            brandId: group.dbBrandId,
            brandStandard,
          });
        }

        return patchGroup(prev, groupId, (g) => {
          const next = applySyncResultToGroup(g, accountId, result, {
            masterTotal: meta?.masterTotal,
          });
          return rebuildGroupMetrics(next);
        });
      });

      const snap = snapshotPending[0];
      if (snap) {
        await upsertAccountSnapshot({
          account: snap.account,
          brandId: snap.brandId,
          result,
          brandStandard: snap.brandStandard,
          masterTotal: meta?.masterTotal,
        });
      }
    },
    [updateGroups],
  );

  const showSyncError = useCallback(
    (message: string, groupId?: string, account?: AccountBrandRow) => {
      if (groupId && account) {
        setTarget({ groupId, account });
      } else {
        setTarget(null);
      }
      setCheckError(normalizeSyncErrorMessage(message));
      setStep('sync-error');
    },
    [],
  );

  const reportBlockingError = useCallback((message: string) => {
    showSyncError(message);
  }, [showSyncError]);

  const runSyncCheck = useCallback(
    async (groupId: string, account: AccountBrandRow) => {
      if (!userId) {
        showSyncError('AUTH_REQUIRED', groupId, account);
        return;
      }

      if (!window.electronAPI?.isElectron) {
        showSyncError('SCRAPER_DESKTOP_REQUIRED', groupId, account);
        return;
      }

      if (!hasValidAccountPhone(account.phoneNumber)) {
        setTarget({ groupId, account });
        setCheckError(null);
        setStep('missing-phone');
        return;
      }

      setRowProcessing(groupId, account.id, 'sync');
      setCheckError(null);
      setSyncMessage(null);

      const stopLoading = () => clearRowProcessing(groupId, account.id);

      try {
        const dbAccountId = await resolveMessagingAccountId({
          userId,
          platform: account.platform,
          brand: account.brandName,
          accName: account.accountName,
          phoneNumber: account.phoneNumber,
          localId: account.id,
        });

        const hasDaily = await fetchHasDailyData(
          account.brandName,
          account.accountName,
          account.phoneNumber,
          account.platform,
          todayScrapeDate(),
        );

        const master = await fetchMasterGroupStats(
          account.brandName,
          account.accountName,
          account.phoneNumber,
          account.platform,
          dbAccountId,
        );

        const reloginCode = hasDaily
          ? 'SESSION_INVALID_RELOGIN'
          : 'SESSION_INVALID_FORCE_SCRAPER';

        const brandX =
          account.groupsTotal > 0 ? account.groupsTotal : master.brandMasterTotal;

        const promptLogin = () => {
          void applyResult(
            groupId,
            account.id,
            syncResultForInvalidSession(brandX, master.adminInMaster),
            { masterTotal: master.joinedInMaster },
          );
          stopLoading();
          showLoginModal(groupId, account, 'sync', reloginCode);
        };

        const hasDbSession = await hasActivePlatformSession(dbAccountId);

        if (!hasDbSession || accountNeedsRelogin(account)) {
          promptLogin();
          return;
        }

        let probe = await withTimeout(
          probePlatformSession({
            sessionId: account.id,
            platform: account.platform,
            accountId: dbAccountId,
          }),
          SYNC_PROBE_TIMEOUT_MS,
          'Session check',
        );

        if (!probe.valid) {
          try {
            await withTimeout(
              warmSessionIfStored({
                sessionId: account.id,
                platform: account.platform,
                accountId: dbAccountId,
                userId,
              }),
              SYNC_WARM_TIMEOUT_MS,
              'Restore session',
            );
            probe = await withTimeout(
              probePlatformSession({
                sessionId: account.id,
                platform: account.platform,
                accountId: dbAccountId,
              }),
              SYNC_PROBE_TIMEOUT_MS,
              'Session check',
            );
          } catch {
            // lanjut ke login
          }
        }

        if (!probe.valid) {
          promptLogin();
          return;
        }

        const brandStandard = account.groupsTotal > 0 ? account.groupsTotal : master.brandMasterTotal;
        const metrics = await refreshAccountMetrics({
          account,
          dbAccountId,
          brandStandard,
        });
        await applyResult(groupId, account.id, metrics.result, {
          masterTotal: metrics.master.joinedInMaster,
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
        if (brandId) {
          await reconcileTicketsForAccount({
            accountId: dbAccountId,
            brandId,
            brandName: account.brandName,
            platform: account.platform,
            deviceY: metrics.result.groupsCurrent,
          });
          onTicketsReload?.();
        }

        stopLoading();

        setTarget({
          groupId,
          account: {
            ...account,
            ...metrics.result,
            isMisaligned: metrics.result.groupsCurrent !== metrics.result.groupsTotal,
          },
        });
        setSyncMessage(
          `DEVICE:${metrics.result.groupsCurrent}|BRAND:${metrics.result.groupsTotal}|MASTER:${metrics.master.joinedInMaster}|ADMIN:${metrics.result.adminCurrent}`,
        );
        setStep('session-valid');
      } catch (error) {
        stopLoading();
        showSyncError(getErrorMessage(error, 'Sync gagal'), groupId, account);
      }
    },
    [
      applyResult,
      clearRowProcessing,
      setRowProcessing,
      showLoginModal,
      showSyncError,
      userId,
    ],
  );

  const handleSyncAccount = useCallback(
    (groupId: string, account: AccountBrandRow) => {
      void runSyncCheck(groupId, account);
    },
    [runSyncCheck],
  );

  const runScrapeInBackground = useCallback(async () => {
    if (!target || !userId) return;

    const { groupId, account } = target;
    setRowProcessing(groupId, account.id, 'scraper');
    setCheckError(null);

    try {
      const dbAccountId = await resolveMessagingAccountId({
        userId,
        platform: account.platform,
        brand: account.brandName,
        accName: account.accountName,
        phoneNumber: account.phoneNumber,
        localId: account.id,
      });

      const scrapeCounts = await runAccountScraper({
        account,
        sessionId: account.id,
        userId,
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

      let brandX = account.groupsTotal;
      if (brandId) {
        brandX = await resolveBrandStandardTotal(
          brandId,
          account.platform,
          account.groupsTotal,
          account.brandName,
        );
      }

      const { result: resultWithBrand, master } = await buildMetricsFromScrapeDaily({
        accountId: dbAccountId,
        brand: account.brandName,
        platform: account.platform,
        brandStandard: brandX,
        sessionValid: true,
        deviceGroupCount: scrapeCounts.deviceGroupCount,
      });

      await applyResult(groupId, account.id, resultWithBrand, {
        masterTotal: master.joinedInMaster,
      });

      if (brandX > 0) {
        updateGroups((prev) =>
          patchGroup(prev, groupId, (g) =>
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

      if (brandId) {
        await reconcileTicketsAfterScrape({
          accountId: dbAccountId,
          platform: account.platform,
          brandName: account.brandName,
          deviceY: resultWithBrand.groupsCurrent,
        });
      }

      onTicketsReload?.();
    } catch (error) {
      const message = getErrorMessage(error, 'SCRAPER_FAILED');
      if (
        message.toLowerCase().includes('log in') ||
        message.toLowerCase().includes('session')
      ) {
        clearRowProcessing(groupId, account.id);
        showLoginModal(groupId, account, 'scraper', 'SESSION_INVALID_FORCE_SCRAPER');
        return;
      }
      showSyncError(message, groupId, account);
    } finally {
      clearRowProcessing(groupId, account.id);
    }
  }, [
    applyResult,
    clearRowProcessing,
    onTicketsReload,
    setRowProcessing,
    showLoginModal,
    showSyncError,
    target,
    userId,
  ]);

  const openScrapePrompt = useCallback(() => {
    setStep('scrape-prompt');
    setCheckError(null);
  }, []);

  const confirmScrapePrompt = useCallback(() => {
    setStep('idle');
    setSyncMessage(null);
    void runScrapeInBackground();
  }, [runScrapeInBackground]);

  const dismissScrapePrompt = useCallback(() => {
    setStep('idle');
    setSyncMessage(null);
  }, []);

  /** Dari modal "Session valid" → konfirmasi jalankan scraper. */
  const openScraperFromSessionValid = useCallback(() => {
    setStep('scrape-prompt');
    setCheckError(null);
  }, []);

  const handleRunScraper = useCallback(
    async (groupId: string, account: AccountBrandRow) => {
      setTarget({ groupId, account });
      setCheckError(null);

      if (!userId) {
        showSyncError('AUTH_REQUIRED', groupId, account);
        return;
      }

      if (!hasValidAccountPhone(account.phoneNumber)) {
        setStep('missing-phone');
        return;
      }

      try {
        const dbAccountId = await resolveMessagingAccountId({
          userId,
          platform: account.platform,
          brand: account.brandName,
          accName: account.accountName,
          phoneNumber: account.phoneNumber,
          localId: account.id,
        });

        const hasSession = await hasActivePlatformSession(dbAccountId);

        if (!hasSession || accountNeedsRelogin(account)) {
          showLoginModal(groupId, account, 'scraper', 'SESSION_INVALID_FORCE_SCRAPER');
          return;
        }

        openScrapePrompt();
      } catch (error) {
        showSyncError(getErrorMessage(error, 'Scraper gagal'), groupId, account);
        clearRowProcessing(groupId, account.id);
      }
    },
    [clearRowProcessing, openScrapePrompt, showLoginModal, showSyncError, userId],
  );

  const confirmScrape = useCallback(() => {
    if (!target) return;
    showLoginModal(
      target.groupId,
      target.account,
      'scraper',
      'SESSION_INVALID_FORCE_SCRAPER',
    );
  }, [showLoginModal, target]);

  const handleLoginSuccess = useCallback(async () => {
    if (!target || !userId) return;

    const { groupId, account } = target;
    const intent = loginIntent ?? 'scraper';

    try {
      const dbAccountId = await resolveMessagingAccountId({
        userId,
        platform: account.platform,
        brand: account.brandName,
        accName: account.accountName,
        phoneNumber: account.phoneNumber,
        localId: account.id,
      });

      markAccountLoginGrace(account.id);
      await persistLoginSessionAfterSuccess({ userId, account });
      setPostLoginGraceAccountId(account.id);
      window.setTimeout(() => {
        setPostLoginGraceAccountId((current) => (current === account.id ? null : current));
      }, 120_000);

      const brandStandard = account.groupsTotal;
      const metrics = await refreshAccountMetrics({
        account,
        dbAccountId,
        brandStandard,
      });
      await applyResult(groupId, account.id, metrics.result, {
        masterTotal: metrics.master.joinedInMaster,
      });

      setSyncMessage(null);
      setLoginIntent(null);

      if (intent === 'sync') {
        setStep('session-valid');
        setTarget({ groupId, account });
        return;
      }

      setStep('idle');
      openScrapePrompt();
    } catch (error) {
      showSyncError(getErrorMessage(error, 'Gagal menyimpan session setelah login'), groupId, account);
      setStep('platform-login');
      throw error;
    }
  }, [applyResult, loginIntent, openScrapePrompt, showSyncError, target, userId]);

  const handleSavePhoneAndSync = useCallback(
    async (phoneNumber: string) => {
      if (!target || !userId) return;

      setPhoneSaving(true);
      setCheckError(null);

      try {
        await updateMessagingAccountPhone(target.account.id, phoneNumber);
        const updatedAccount = { ...target.account, phoneNumber };
        updateGroups((groups) =>
          patchAccountPhone(groups, target.groupId, target.account.id, phoneNumber),
        );
        setTarget({ groupId: target.groupId, account: updatedAccount });
        setStep('idle');
        await runSyncCheck(target.groupId, updatedAccount);
      } catch (error) {
        showSyncError(getErrorMessage(error, 'Gagal menyimpan nomor telepon'), target.groupId, target.account);
      } finally {
        setPhoneSaving(false);
      }
    },
    [runSyncCheck, target, updateGroups, userId],
  );

  const activePlatform: Platform | null = target?.account.platform ?? null;

  return {
    processingAccountId,
    processingAction,
    postLoginGraceAccountId,
    step,
    target,
    checkError,
    syncMessage,
    loginIntent,
    phoneSaving,
    activePlatform,
    handleSyncAccount,
    handleRunScraper,
    confirmScrape,
    confirmScrapePrompt,
    dismissScrapePrompt,
    openScraperFromSessionValid,
    handleLoginSuccess,
    handleSavePhoneAndSync,
    reportBlockingError,
    closeFlow,
  };
}
