import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import type { UiScrapeProgress } from '@/types/scrapeProgress';
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
import { ensurePlatformSessionInDatabase } from '@/lib/ensureWaSessionInDb';
import {
  diagnoseSessionResolve,
  formatSessionDiagnostics,
  resolveDbAccountForRow,
} from '@/lib/accountSessionResolve';
import { requireLiveDeviceSession } from '@/lib/liveDeviceSession';
import { invalidatePlatformSessionEverywhere } from '@/lib/platformSessionSync';
import { runAccountScraper } from '@/lib/runAccountScraper';
import { backfillPlatformSessionIfNeeded, hasUsableLoginSession } from '@/lib/sessionAvailability';
import { patchBrandPlatformMasterInGroups } from '@/lib/patchAccountMasterInGroups';
import { syncResultForInvalidSession } from '@/lib/accountSessionUi';
import { completeSyncAfterLiveSession } from '@/lib/syncAccountFlow';
import { persistLoginSessionAfterSuccess } from '@/lib/persistLoginSession';
import { recordSyncActivity } from '@/lib/syncActivityLog';
import { markAccountLoginGrace } from '@/lib/sessionRealtimePolicy';
import { getErrorMessage } from '@/lib/errorMessage';
import { PHONE_COLUMN_MIGRATION_HINT } from '@/lib/dbPhoneSchema';
import { hasValidAccountPhone, updateMessagingAccountPhone } from '@/lib/accountPhone';
import { probePlatformSession } from '@/lib/sessionProbe';
import { OperationTimeoutError, withTimeout } from '@/lib/withTimeout';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

/** Satu probe per klik Sync (manual). */
const SYNC_PROBE_TIMEOUT_MS = 45_000;
const LOGIN_PERSIST_TIMEOUT_MS = 90_000;
const LOGIN_SYNC_AFTER_TIMEOUT_MS = 120_000;
function accountShowsLoggedOut(account: AccountBrandRow): boolean {
  return account.sessionStatus === 'invalid' || account.status === 'logout';
}

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
  /** UUID `resource_management_messaging_accounts` — untuk warm/probe session di DB. */
  dbAccountId?: string;
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
  const scrapeSessionByAccountRef = useRef<Map<string, string>>(new Map());
  const [scrapeProgressBySession, setScrapeProgressBySession] = useState<
    Record<string, UiScrapeProgress>
  >({});

  useEffect(() => {
    const unsub = window.electronAPI?.scraper?.onProgress?.((payload) => {
      const current = payload.current ?? 0;
      const total = payload.total ?? 0;
      const percent =
        total > 0 && payload.current != null
          ? Math.min(100, Math.round((payload.current / total) * 100))
          : null;

      setScrapeProgressBySession((prev) => ({
        ...prev,
        [payload.sessionId]: {
          phase: payload.phase,
          current,
          total,
          label: payload.label ?? payload.phase,
          percent,
        },
      }));
    });
    return () => unsub?.();
  }, []);

  const clearScrapeProgress = useCallback((accountId: string) => {
    const sessionId = scrapeSessionByAccountRef.current.get(accountId);
    scrapeSessionByAccountRef.current.delete(accountId);
    setScrapeProgressBySession((prev) => {
      const next = { ...prev };
      if (sessionId) delete next[sessionId];
      delete next[accountId];
      return next;
    });
  }, []);

  const getScrapeProgress = useCallback(
    (accountId: string): UiScrapeProgress | null => {
      const sessionId = scrapeSessionByAccountRef.current.get(accountId) ?? accountId;
      return scrapeProgressBySession[sessionId] ?? scrapeProgressBySession[accountId] ?? null;
    },
    [scrapeProgressBySession],
  );

  const updateGroups = useCallback(
    (patcher: (groups: AccountBrandGroup[]) => AccountBrandGroup[]) => {
      onGroupsChange((prev) => patcher(prev));
    },
    [onGroupsChange],
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

  /** Buka modal login — tanpa probe/cek session tersembunyi sebelumnya. */
  const showLoginModal = useCallback(
    (
      groupId: string,
      account: AccountBrandRow,
      intent: 'sync' | 'scraper',
      message: string,
      knownDbAccountId?: string,
    ) => {
      setTarget({ groupId, account, dbAccountId: knownDbAccountId });
      setLoginIntent(intent);
      setSyncMessage(message);
      setCheckError(null);
      setStep('platform-login');
    },
    [],
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

      // Logout/INVALID + Sync = buka login sekarang. Tanpa PROC SYNC, tanpa query master/probe.
      if (accountShowsLoggedOut(account)) {
        try {
          const { accountId: dbAccountId } = await resolveDbAccountForRow({
            userId,
            account,
          });
          const brandX = account.groupsTotal > 0 ? account.groupsTotal : 0;
          void applyResult(
            groupId,
            account.id,
            syncResultForInvalidSession(brandX, account.adminCurrent),
          );
          showLoginModal(groupId, account, 'sync', 'SESSION_INVALID_RELOGIN', dbAccountId);
        } catch (error) {
          showSyncError(getErrorMessage(error, 'SYNC_FAILED'), groupId, account);
        }
        return;
      }

      setRowProcessing(groupId, account.id, 'sync');
      setCheckError(null);
      setSyncMessage(null);

      const stopLoading = () => clearRowProcessing(groupId, account.id);

      try {
        const { accountId: dbAccountId, matchedBy } = await resolveDbAccountForRow({
          userId,
          account,
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
          showLoginModal(groupId, account, 'sync', reloginCode, dbAccountId);
        };

        const runSessionProbe = (timeoutMs: number) =>
          withTimeout(
            probePlatformSession({
              sessionId: account.id,
              platform: account.platform,
              accountId: dbAccountId,
              strict: true,
            }),
            timeoutMs,
            'Session check',
          );

        const probeWithTimeout = async (timeoutMs: number) => {
          try {
            return await runSessionProbe(timeoutMs);
          } catch (probeError) {
            if (probeError instanceof OperationTimeoutError) {
              return {
                valid: false as const,
                message: 'Session check timed out — log in again.',
              };
            }
            throw probeError;
          }
        };

        if (account.platform === 'whatsapp') {
          await ensurePlatformSessionInDatabase({
            dbAccountId,
            uiSessionId: account.id,
            platform: account.platform,
          });
        }

        let hasSession = await hasUsableLoginSession({
          sessionId: account.id,
          platform: account.platform,
          accountId: dbAccountId,
          accountName: account.accountName,
        });

        if (!hasSession) {
          const diag = await diagnoseSessionResolve({
            account,
            resolvedAccountId: dbAccountId,
            matchedBy,
          });
          console.error('[sync] no session:', formatSessionDiagnostics(diag));
          if (!diag.supabase) {
            showSyncError('SUPABASE_NOT_CONFIGURED', groupId, account);
            stopLoading();
            return;
          }
          if (!diag.electron) {
            showSyncError('SCRAPER_DESKTOP_REQUIRED', groupId, account);
            stopLoading();
            return;
          }
          promptLogin();
          return;
        }

        await backfillPlatformSessionIfNeeded({ userId, account, dbAccountId });

        const probe = await probeWithTimeout(SYNC_PROBE_TIMEOUT_MS);

        if (!probe.valid) {
          // Step 2 — session gagal → logout DB + UI, buka login QR/phone.
          await invalidatePlatformSessionEverywhere(
            dbAccountId,
            probe.message ?? 'device_not_connected',
            account.platform,
          );
          const invalidResult = syncResultForInvalidSession(brandX, master.adminInMaster);
          await recordSyncActivity({
            accountId: dbAccountId,
            platform: account.platform,
            syncSource: 'manual',
            sessionStatus: 'logout',
            deviceGroups: 0,
            brandGroups: invalidResult.groupsTotal,
            adminGroups: invalidResult.adminCurrent,
            message: probe.message ?? 'device_not_connected',
          });
          promptLogin();
          return;
        }

        // Step 1 — session valid + connected: persist DB, sync grup brand & device, popup.
        const brandStandard = account.groupsTotal > 0 ? account.groupsTotal : master.brandMasterTotal;
        const syncPayload = await completeSyncAfterLiveSession({
          userId,
          account,
          dbAccountId,
          brandStandardHint: brandStandard,
          assumeSessionValid: true,
        });

        await applyResult(groupId, account.id, syncPayload.result, {
          masterTotal: syncPayload.masterJoined,
        });

        await recordSyncActivity({
          accountId: dbAccountId,
          platform: account.platform,
          syncSource: 'manual',
          sessionStatus: 'valid',
          deviceGroups: syncPayload.result.groupsCurrent,
          brandGroups: syncPayload.result.groupsTotal,
          adminGroups: syncPayload.result.adminCurrent,
          message: syncPayload.syncMessage,
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
            deviceY: syncPayload.result.groupsCurrent,
          });
          onTicketsReload?.();
        }

        stopLoading();

        setTarget({
          groupId,
          account: {
            ...account,
            ...syncPayload.result,
            status: 'active',
            sessionStatus: 'valid',
            isMisaligned: syncPayload.result.groupsCurrent !== syncPayload.result.groupsTotal,
          },
          dbAccountId,
        });
        setSyncMessage(syncPayload.syncMessage);
        setStep('session-valid');
      } catch (error) {
        stopLoading();
        showSyncError(getErrorMessage(error, 'SYNC_FAILED'), groupId, account);
      }
    },
    [
      applyResult,
      clearRowProcessing,
      setRowProcessing,
      showLoginModal,
      showSyncError,
      updateGroups,
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
      const { accountId: dbAccountId } = await resolveDbAccountForRow({ userId, account });
      const deviceSessionId = await resolveDeviceSessionId({
        sessionId: account.id,
        platform: account.platform,
        accountId: dbAccountId,
      });
      scrapeSessionByAccountRef.current.set(account.id, deviceSessionId);

      const live = await requireLiveDeviceSession({
        sessionId: account.id,
        platform: account.platform,
        accountId: dbAccountId,
      });
      if (!live.ok) {
        await invalidatePlatformSessionEverywhere(
          dbAccountId,
          live.message,
          account.platform,
        );
        clearRowProcessing(groupId, account.id);
        showLoginModal(groupId, account, 'scraper', 'SESSION_INVALID_FORCE_SCRAPER');
        return;
      }

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

      updateGroups((prev) => {
        void patchBrandPlatformMasterInGroups(prev, account.brandName, account.platform).then(
          (next) => onGroupsChange(() => next),
        );
        return prev;
      });

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
      clearScrapeProgress(account.id);
      clearRowProcessing(groupId, account.id);
    }
  }, [
    applyResult,
    clearScrapeProgress,
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
    setStep('idle');
    setSyncMessage(null);
    void runScrapeInBackground();
  }, [runScrapeInBackground]);

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
        const { accountId: dbAccountId } = await resolveDbAccountForRow({ userId, account });

        const hasSession = await hasUsableLoginSession({
          sessionId: account.id,
          platform: account.platform,
          accountId: dbAccountId,
          accountName: account.accountName,
        });

        if (!hasSession) {
          showLoginModal(
            groupId,
            account,
            'scraper',
            'SESSION_INVALID_FORCE_SCRAPER',
            dbAccountId,
          );
          return;
        }

        const live = await requireLiveDeviceSession({
          sessionId: account.id,
          platform: account.platform,
          accountId: dbAccountId,
        });
        if (!live.ok) {
          await invalidatePlatformSessionEverywhere(
            dbAccountId,
            live.message,
            account.platform,
          );
          showLoginModal(
            groupId,
            account,
            'scraper',
            'SESSION_INVALID_FORCE_SCRAPER',
            dbAccountId,
          );
          return;
        }

        await backfillPlatformSessionIfNeeded({ userId, account, dbAccountId });
        setTarget({ groupId, account, dbAccountId });
        openScrapePrompt();
      } catch (error) {
        showSyncError(getErrorMessage(error, 'Scraper gagal'), groupId, account);
        clearRowProcessing(groupId, account.id);
      }
    },
    [clearRowProcessing, openScrapePrompt, showLoginModal, showSyncError, userId],
  );

  const confirmScrape = useCallback(() => {
    if (!target || !userId) return;

    void (async () => {
      const { groupId, account } = target;
      try {
        const { accountId: dbAccountId } = await resolveDbAccountForRow({ userId, account });

        const hasSession = await hasUsableLoginSession({
          sessionId: account.id,
          platform: account.platform,
          accountId: dbAccountId,
          accountName: account.accountName,
        });

        if (hasSession) {
          await backfillPlatformSessionIfNeeded({ userId, account, dbAccountId });
          setTarget({ groupId, account, dbAccountId });
          openScrapePrompt();
          return;
        }

        showLoginModal(
          groupId,
          account,
          'scraper',
          'SESSION_INVALID_FORCE_SCRAPER',
          dbAccountId,
        );
      } catch (error) {
        showSyncError(getErrorMessage(error, 'SCRAPER_FAILED'), groupId, account);
      }
    })();
  }, [openScrapePrompt, showLoginModal, showSyncError, target, userId]);

  const handleLoginSuccess = useCallback(async () => {
    if (!target || !userId) return;

    const { groupId, account } = target;
    try {
      const { accountId: dbAccountId } = await resolveDbAccountForRow({ userId, account });

      markAccountLoginGrace(account.id);
      setPostLoginGraceAccountId(account.id);
      window.setTimeout(() => {
        setPostLoginGraceAccountId((current) => (current === account.id ? null : current));
      }, 120_000);

      await withTimeout(
        persistLoginSessionAfterSuccess({ userId, account }),
        LOGIN_PERSIST_TIMEOUT_MS,
        'Save session after login',
      );

      const syncPayload = await withTimeout(
        completeSyncAfterLiveSession({
          userId,
          account,
          dbAccountId,
          assumeSessionValid: true,
          skipPersist: true,
        }),
        LOGIN_SYNC_AFTER_TIMEOUT_MS,
        'Sync after login',
      );

      await applyResult(groupId, account.id, syncPayload.result, {
        masterTotal: syncPayload.masterJoined,
      });

      setLoginIntent(null);
      setTarget({
        groupId,
        account: {
          ...account,
          ...syncPayload.result,
          status: 'active',
          sessionStatus: 'valid',
          isMisaligned: syncPayload.result.groupsCurrent !== syncPayload.result.groupsTotal,
        },
        dbAccountId,
      });
      setSyncMessage(syncPayload.syncMessage);
      setStep('session-valid');
    } catch (error) {
      showSyncError(getErrorMessage(error, 'Gagal menyimpan session setelah login'), groupId, account);
      setStep('sync-error');
    }
  }, [applyResult, showSyncError, target, userId]);

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
    getScrapeProgress,
  };
}
