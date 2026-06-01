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
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { patchAccountSessionInGroups } from '@/lib/accountSessionPatch';
import { invalidateUserSessionOnDeviceFailure } from '@/lib/userActionSession';
import {
  buildLogoutRowAfterDeviceFailure,
  checkDeviceSessionForValidColumn,
  detectGroupsAndBuildSyncPayload,
  reloginCodeForSync,
  routeFromSessionColumn,
} from '@/lib/manualSyncFlow';
import { isAccountInLoginGrace } from '@/lib/sessionRealtimePolicy';
import { runAccountScraper } from '@/lib/runAccountScraper';
import {
  backfillPlatformSessionIfNeeded,
  hasStoredPlatformSession,
} from '@/lib/sessionAvailability';
import { persistLoginSessionAfterSuccess } from '@/lib/persistLoginSession';
import { recordSyncActivity } from '@/lib/syncActivityLog';
import { markAccountLoginGrace, markAccountScrapeGrace } from '@/lib/sessionRealtimePolicy';
import { isRowMisaligned, postSyncModalStep } from '@/lib/accountSyncUiFlow';
import { getErrorMessage } from '@/lib/errorMessage';
import { PHONE_COLUMN_MIGRATION_HINT } from '@/lib/dbPhoneSchema';
import {
  accountMissingRequiredPhone,
  updateMessagingAccountPhone,
} from '@/lib/accountPhone';
import { scrapeFailureNeedsLoginModal } from '@/lib/scrapeErrorUi';
import { OperationTimeoutError, withTimeout } from '@/lib/withTimeout';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

const LOGIN_PERSIST_TIMEOUT_MS = 90_000;
const LOGIN_SYNC_AFTER_TIMEOUT_MS = 120_000;
/** Manual Sync (VALID): gate + hitung grup device — lewat ini = error, bukan PROC SYNC selamanya. */
const MANUAL_SYNC_TIMEOUT_MS = 180_000;
export type SyncFlowStep =
  | 'idle'
  | 'missing-phone'
  | 'sync-error'
  | 'resume-empty'
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
  const scrapeActiveAccountIdsRef = useRef<Set<string>>(new Set());
  const [loginModalEpoch, setLoginModalEpoch] = useState(0);
  /** UUID DB saat sync/scrape — jangan useState (urutan hook harus stabil). */
  const processingDbAccountIdRef = useRef<string | null>(null);
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
    processingDbAccountIdRef.current = null;
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
      processingDbAccountIdRef.current = null;
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
      meta?: { masterTotal?: number; lastSyncAt?: string | null },
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
          group && account
            ? (group.standardGroupCountByPlatform?.[account.platform] ?? 0)
            : 0;

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
            lastSyncAt: meta?.lastSyncAt,
          });
          return rebuildGroupMetrics(next);
        });
      });

      const snap = snapshotPending[0];
      if (snap) {
        let resolvedBrandId: string | undefined = snap.brandId;
        if (!resolvedBrandId) {
          const supabase = getSupabase();
          if (supabase) {
            const { data } = await supabase
              .from(TABLES.messagingAccounts)
              .select('brand_id')
              .eq('id', accountId)
              .maybeSingle();
            resolvedBrandId = data?.brand_id as string | undefined;
          }
        }
        if (resolvedBrandId) {
          await upsertAccountSnapshot({
            account: {
              ...snap.account,
              status: result.sessionStatus === 'valid' ? 'active' : 'logout',
              sessionStatus: result.sessionStatus,
              groupsCurrent: result.groupsCurrent,
              groupsTotal: result.groupsTotal,
              adminCurrent: result.adminCurrent,
              adminTotal: result.adminTotal,
              lastSyncAt: meta?.lastSyncAt ?? snap.account.lastSyncAt,
            },
            brandId: resolvedBrandId,
            result,
            brandStandard: snap.brandStandard,
            masterTotal: meta?.masterTotal,
            lastSyncAt: meta?.lastSyncAt,
          });
        }
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
      if (scrapeActiveAccountIdsRef.current.has(account.id)) {
        return;
      }
      setLoginModalEpoch((n) => n + 1);
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

      if (accountMissingRequiredPhone(account.platform, account.phoneNumber)) {
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
        const { accountId: dbAccountId } = await resolveDbAccountForRow({
          userId,
          account,
        });
        processingDbAccountIdRef.current = dbAccountId;

        // SYNC — cabang 1: kolom Session INVALID → login (tanpa cek device).
        if (routeFromSessionColumn(account.sessionStatus) === 'open_login') {
          const hasStored = await hasStoredPlatformSession(dbAccountId, account.platform);
          const hasDaily = await fetchHasDailyData(
            account.brandName,
            account.accountName,
            account.phoneNumber,
            account.platform,
            todayScrapeDate(),
          );
          stopLoading();
          showLoginModal(
            groupId,
            account,
            'sync',
            reloginCodeForSync({ hasStoredSession: hasStored, hasDailyToday: hasDaily }),
            dbAccountId,
          );
          return;
        }

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

        const brandX = master.brandMasterTotal;

        if (account.platform === 'whatsapp') {
          await ensurePlatformSessionInDatabase({
            dbAccountId,
            uiSessionId: account.id,
            platform: account.platform,
          });
        }

        await backfillPlatformSessionIfNeeded({ userId, account, dbAccountId });

        const deviceCheck = await checkDeviceSessionForValidColumn({
          sessionId: account.id,
          platform: account.platform,
          dbAccountId,
          action: 'sync',
          hasDailyToday: hasDaily,
        });

        // SYNC — cabang 2b: device tidak valid → invalid DB/UI → login.
        if (!deviceCheck.ok) {
          const invalidResult = await buildLogoutRowAfterDeviceFailure({
            dbAccountId,
            brand: account.brandName,
            platform: account.platform,
            brandStandard: brandX,
            message: deviceCheck.message,
            shouldInvalidate: deviceCheck.shouldInvalidate,
          });
          updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
          await recordSyncActivity({
            accountId: dbAccountId,
            platform: account.platform,
            syncSource: 'manual',
            sessionStatus: 'logout',
            deviceGroups: invalidResult.groupsCurrent,
            brandGroups: invalidResult.groupsTotal,
            adminGroups: invalidResult.adminCurrent,
            message: deviceCheck.message,
          });
          await applyResult(groupId, account.id, invalidResult, {
            masterTotal: master.joinedInMaster,
          });
          stopLoading();
          showLoginModal(groupId, account, 'sync', deviceCheck.reloginCode, dbAccountId);
          return;
        }

        // SYNC — cabang 2a: device valid → detect X+Y → update kolom → scrape prompt.
        const brandStandard = master.brandMasterTotal;
        const syncPayload = await withTimeout(
          detectGroupsAndBuildSyncPayload({
            userId,
            account,
            dbAccountId,
            brandStandardHint: brandStandard,
          }),
          MANUAL_SYNC_TIMEOUT_MS,
          'Manual sync',
        );

        const syncedAt = new Date().toISOString();
        await applyResult(groupId, account.id, syncPayload.result, {
          masterTotal: syncPayload.masterJoined,
          lastSyncAt: syncedAt,
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
            isMisaligned: isRowMisaligned(syncPayload.result),
          },
          dbAccountId,
        });
        setSyncMessage(syncPayload.syncMessage);
        setStep(
          postSyncModalStep({
            result: syncPayload.result,
            deviceGroupCount: syncPayload.deviceGroupCount,
            hasDailyToday: syncPayload.hasDailyToday,
          }),
        );
      } catch (error) {
        stopLoading();
        const code =
          error instanceof OperationTimeoutError ? 'SYNC_TIMED_OUT' : 'SYNC_FAILED';
        showSyncError(code, groupId, account);
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

  const runScrapeInBackground = useCallback(async (
    override?: SyncTarget,
    options?: { skipDeviceCheck?: boolean },
  ) => {
    const ctx = override ?? target;
    if (!ctx || !userId) return;

    const { groupId, account } = ctx;

    if (routeFromSessionColumn(account.sessionStatus) === 'open_login') {
      const { accountId: dbAccountId } = await resolveDbAccountForRow({ userId, account });
      const hasStored = await hasStoredPlatformSession(dbAccountId, account.platform);
      showLoginModal(
        groupId,
        account,
        'scraper',
        reloginCodeForSync({ hasStoredSession: hasStored, hasDailyToday: false }),
        dbAccountId,
      );
      return;
    }

    scrapeActiveAccountIdsRef.current.add(account.id);
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

      const skipDeviceCheck =
        options?.skipDeviceCheck === true || isAccountInLoginGrace(account.id);

      if (!skipDeviceCheck) {
        const deviceCheck = await checkDeviceSessionForValidColumn({
          sessionId: account.id,
          platform: account.platform,
          dbAccountId,
          action: 'run',
        });

        if (!deviceCheck.ok) {
          clearRowProcessing(groupId, account.id);
          scrapeActiveAccountIdsRef.current.delete(account.id);

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
          updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
          await applyResult(groupId, account.id, invalidResult);
          showLoginModal(groupId, account, 'scraper', deviceCheck.reloginCode, dbAccountId);
          return;
        }
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
        brandStandard: brandX,
        sessionValid: true,
        deviceGroupCount: scrapeCounts.deviceGroupCount,
        deviceAdminCount: scrapeCounts.deviceAdminCount,
      });

      const scrapedAt = new Date().toISOString();
      await applyResult(groupId, account.id, built, {
        masterTotal: master.joinedInMaster,
        lastSyncAt: scrapedAt,
      });

      markAccountScrapeGrace(account.id);
      markAccountLoginGrace(account.id);

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
          deviceY: built.groupsCurrent,
        });
      }

      onTicketsReload?.();
    } catch (error) {
      const message = getErrorMessage(error, 'SCRAPER_FAILED');
      clearRowProcessing(groupId, account.id);
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
        updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
        showLoginModal(
          groupId,
          account,
          'scraper',
          'SESSION_INVALID_RELOGIN',
          dbForLogin,
        );
        return;
      }
      showSyncError(message, groupId, account);
    } finally {
      scrapeActiveAccountIdsRef.current.delete(account.id);
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

  const confirmScrapePrompt = useCallback(() => {
    if (!target) return;
    const scrapeTarget = target;
    setStep('idle');
    setSyncMessage(null);
    void runScrapeInBackground(scrapeTarget, { skipDeviceCheck: true });
  }, [runScrapeInBackground, target]);

  const dismissScrapePrompt = useCallback(() => {
    setStep('idle');
    setSyncMessage(null);
  }, []);

  const handleRunScraper = useCallback(
    async (groupId: string, account: AccountBrandRow) => {
      setTarget({ groupId, account });
      setCheckError(null);

      if (!userId) {
        showSyncError('AUTH_REQUIRED', groupId, account);
        return;
      }

      if (!window.electronAPI?.isElectron) {
        showSyncError('SCRAPER_DESKTOP_REQUIRED', groupId, account);
        return;
      }

      if (accountMissingRequiredPhone(account.platform, account.phoneNumber)) {
        setStep('missing-phone');
        return;
      }

      try {
        const { accountId: dbAccountId } = await resolveDbAccountForRow({ userId, account });

        // RUN — keputusan dari kolom Session di baris.
        if (routeFromSessionColumn(account.sessionStatus) === 'open_login') {
          const hasStored = await hasStoredPlatformSession(dbAccountId, account.platform);
          showLoginModal(
            groupId,
            account,
            'scraper',
            reloginCodeForSync({ hasStoredSession: hasStored, hasDailyToday: false }),
            dbAccountId,
          );
          return;
        }

        setRowProcessing(groupId, account.id, 'scraper');
        await backfillPlatformSessionIfNeeded({ userId, account, dbAccountId });

        const deviceCheck = await checkDeviceSessionForValidColumn({
          sessionId: account.id,
          platform: account.platform,
          dbAccountId,
          action: 'run',
        });

        if (!deviceCheck.ok) {
          clearRowProcessing(groupId, account.id);

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
          updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
          await applyResult(groupId, account.id, invalidResult);
          showLoginModal(groupId, account, 'scraper', deviceCheck.reloginCode, dbAccountId);
          return;
        }

        const scrapeTarget = { groupId, account, dbAccountId };
        setTarget(scrapeTarget);
        void runScrapeInBackground(scrapeTarget, { skipDeviceCheck: true });
      } catch (error) {
        showSyncError(getErrorMessage(error, 'Scraper gagal'), groupId, account);
        clearRowProcessing(groupId, account.id);
      }
    },
    [
      applyResult,
      clearRowProcessing,
      runScrapeInBackground,
      setRowProcessing,
      showLoginModal,
      showSyncError,
      updateGroups,
      userId,
    ],
  );

  const handleLoginSuccess = useCallback(async () => {
    if (!target || !userId) return;

    const { groupId, account } = target;
    const savedIntent = loginIntent;
    setLoginIntent(null);
    setRowProcessing(groupId, account.id, 'sync');

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

      const masterAfterLogin = await fetchMasterGroupStats(
        account.brandName,
        account.accountName,
        account.phoneNumber,
        account.platform,
        dbAccountId,
      );

      const syncPayload = await withTimeout(
        detectGroupsAndBuildSyncPayload({
          userId,
          account,
          dbAccountId,
          brandStandardHint: masterAfterLogin.brandMasterTotal,
          skipPersist: true,
        }),
        LOGIN_SYNC_AFTER_TIMEOUT_MS,
        'Sync after login',
      );

      const syncedAt = new Date().toISOString();
      await applyResult(groupId, account.id, syncPayload.result, {
        masterTotal: syncPayload.masterJoined,
        lastSyncAt: syncedAt,
      });

      const updatedAccount: AccountBrandRow = {
        ...account,
        ...syncPayload.result,
        status: 'active',
        sessionStatus: 'valid',
        isMisaligned: isRowMisaligned(syncPayload.result),
        lastSyncAt: syncedAt,
      };

      setTarget({ groupId, account: updatedAccount, dbAccountId });
      setSyncMessage(syncPayload.syncMessage);
      clearRowProcessing(groupId, account.id);
      setStep('idle');

      if (savedIntent === 'scraper') {
        void runScrapeInBackground({ groupId, account: updatedAccount, dbAccountId });
        return;
      }

      setStep(
        postSyncModalStep({
          result: syncPayload.result,
          deviceGroupCount: syncPayload.deviceGroupCount,
          hasDailyToday: syncPayload.hasDailyToday,
        }),
      );
    } catch (error) {
      clearRowProcessing(groupId, account.id);
      showSyncError(getErrorMessage(error, 'Gagal menyimpan session setelah login'), groupId, account);
      setStep('sync-error');
    }
  }, [
    applyResult,
    clearRowProcessing,
    loginIntent,
    runScrapeInBackground,
    setRowProcessing,
    showSyncError,
    target,
    userId,
  ]);

  const handleSavePhoneAndSync = useCallback(
    async (phoneNumber: string) => {
      if (!target || !userId) return;

      setPhoneSaving(true);
      setCheckError(null);

      try {
        const phoneAccountId =
          target.dbAccountId ??
          (await resolveDbAccountForRow({ userId, account: target.account })).accountId;
        await updateMessagingAccountPhone(phoneAccountId, phoneNumber);
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
    processingDbAccountId: processingDbAccountIdRef.current,
    processingAction,
    postLoginGraceAccountId,
    step,
    target,
    checkError,
    syncMessage,
    loginIntent,
    loginModalEpoch,
    phoneSaving,
    activePlatform,
    handleSyncAccount,
    handleRunScraper,
    confirmScrapePrompt,
    dismissScrapePrompt,
    handleLoginSuccess,
    handleSavePhoneAndSync,
    reportBlockingError,
    closeFlow,
    getScrapeProgress,
  };
}
