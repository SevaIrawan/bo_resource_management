import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { UiScrapeProgress } from '@/types/scrapeProgress';
import {
  applySyncResultToGroup,
  patchBrandGroup,
  rebuildGroupMetrics,
  setAccountProcessAction,
  type AccountSyncResult,
} from '@/lib/accountBrandUtils';
import { upsertAccountSnapshot } from '@/lib/accountSnapshots';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import {
  prepareDeviceForPlatformLogin,
  type LoginPurgeWaDiskHint,
} from '@/lib/prepareDeviceForLogin';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { patchAccountSessionInGroups } from '@/lib/accountSessionPatch';
import { recordSyncActivity } from '@/lib/syncActivityLog';
import {
  isAccountInLoginGrace,
  markAccountLoginGrace,
} from '@/lib/sessionRealtimePolicy';
import { getErrorMessage } from '@/lib/errorMessage';
import { PHONE_COLUMN_MIGRATION_HINT } from '@/lib/dbPhoneSchema';
import {
  accountMissingRequiredPhone,
  updateMessagingAccountPhone,
} from '@/lib/accountPhone';
import type { AccountBrandGroup, AccountBrandRow, AccountProcessAction } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';
import {
  applyDailyMetricsAfterLogin,
  fetchBrandIdForAccount,
  LOGIN_GRACE_MS,
  persistSessionAfterLogin,
  recoverLoginMetricsIfPersisted,
  resolvePostLoginModalStep,
} from '@/services/loginFlowService';
import {
  POST_LOGIN_GRACE_MS,
  recordSyncCheckActivity,
  resolveDbAccountId,
  routeFromSessionColumn,
  runSyncCheckFlow,
} from '@/services/syncFlowService';
import {
  prepareScrapeSession,
  resolveScrapeLoginIfNeeded,
  runScrapeFlow,
} from '@/services/scrapeFlowService';
import {
  tryLockUserAction,
  unlockUserAction,
  userActionLockErrorCode,
} from '@/lib/userActionGate';

export type SyncFlowStep =
  | 'idle'
  | 'missing-phone'
  | 'sync-error'
  | 'resume-empty'
  | 'scrape-prompt'
  | 'platform-login'
  | 'scrape-cancel-confirm'
  | 'scrape-cancelled';

interface SyncTarget {
  groupId: string;
  account: AccountBrandRow;
  dbAccountId?: string;
}

interface UseAccountSyncFlowOptions {
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  userId?: string | null;
  onTicketsReload?: (dbAccountId: string) => void | Promise<void>;
  canOperatePlatform?: boolean;
  /** i18n dari parent — hindari hook tambahan di dalam custom hook. */
  translate: (key: string) => string;
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

function isScrapeCancelledMessage(message: string): boolean {
  return message.includes('SCRAPER_CANCELLED');
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
  canOperatePlatform = true,
  translate: t,
}: UseAccountSyncFlowOptions) {
  const [processingAccountId, setProcessingAccountId] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<'sync' | 'scraper' | null>(null);
  const [postLoginGraceAccountId, setPostLoginGraceAccountId] = useState<string | null>(null);
  const [step, setStep] = useState<SyncFlowStep>('idle');
  const [target, setTarget] = useState<SyncTarget | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [loginHintCode, setLoginHintCode] = useState<
    import('@/services/syncFlowService').SyncLoginReloginCode | null
  >(null);
  const [loginIntent, setLoginIntent] = useState<'sync' | 'scraper' | null>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [loginModalEpoch, setLoginModalEpoch] = useState(0);
  const scrapeSessionByAccountRef = useRef<Map<string, string>>(new Map());
  const processingDbAccountIdRef = useRef<string | null>(null);
  const [processingDbAccountId, setProcessingDbAccountId] = useState<string | null>(null);
  const [scrapeProgressBySession, setScrapeProgressBySession] = useState<
    Record<string, UiScrapeProgress>
  >({});

  useEffect(() => {
    const unsub = window.electronAPI?.scraper?.onProgress?.((payload) => {
      const current = payload.current ?? 0;
      const total = payload.total ?? 0;
      const percent =
        total > 0 && payload.current != null
          ? Math.min(100, Math.round((current / total) * 100))
          : null;

      const entry: UiScrapeProgress = {
        phase: payload.phase,
        current,
        total,
        label: payload.label ?? payload.phase,
        percent,
      };

      setScrapeProgressBySession((prev) => {
        const next = { ...prev, [payload.sessionId]: entry };
        for (const [accountId, sessionId] of scrapeSessionByAccountRef.current.entries()) {
          if (sessionId === payload.sessionId) {
            next[accountId] = entry;
          }
        }
        return next;
      });
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

  /** Tutup modal sync/scrape tanpa membatalkan spinner baris — dipanggil sebelum aksi baru. */
  const dismissSyncModals = useCallback(() => {
    setStep('idle');
    setCheckError(null);
    setSyncMessage(null);
    setLoginHintCode(null);
    setLoginIntent(null);
  }, []);

  const setRowProcessing = useCallback(
    (
      groupId: string,
      accountId: string,
      rowAction: AccountProcessAction,
      spinner: 'sync' | 'scraper' | null = null,
    ) => {
      setProcessingAccountId(accountId);
      if (spinner) {
        setProcessingAction(spinner);
      } else if (rowAction === 'sync' || rowAction === 'scraper') {
        setProcessingAction(rowAction);
      }
      updateGroups((groups) =>
        patchBrandGroup(groups, groupId, (group) =>
          setAccountProcessAction(group, accountId, rowAction),
        ),
      );
    },
    [updateGroups],
  );

  const patchRowProcessAction = useCallback(
    (groupId: string, accountId: string, action: AccountProcessAction) => {
      updateGroups((groups) =>
        patchBrandGroup(groups, groupId, (group) =>
          setAccountProcessAction(group, accountId, action),
        ),
      );
    },
    [updateGroups],
  );

  const clearRowProcessing = useCallback(
    (groupId: string, accountId: string) => {
      setProcessingAccountId(null);
      setProcessingDbAccountId(null);
      processingDbAccountIdRef.current = null;
      setProcessingAction(null);
      updateGroups((groups) =>
        patchBrandGroup(groups, groupId, (group) => setAccountProcessAction(group, accountId, null)),
      );
    },
    [updateGroups],
  );

  const closeFlow = useCallback(() => {
    if (step === 'platform-login' && target) {
      void window.electronAPI?.platformLogin
        ?.cancel(target.account.id, target.account.platform)
        .catch(() => undefined);
      clearRowProcessing(target.groupId, target.account.id);
    }
    dismissSyncModals();
    setTarget(null);
    setProcessingAccountId(null);
    setProcessingDbAccountId(null);
    processingDbAccountIdRef.current = null;
    setProcessingAction(null);
  }, [clearRowProcessing, dismissSyncModals, step, target]);

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
          snapshotPending.push({ account, brandId: group.dbBrandId, brandStandard });
        }

        return patchBrandGroup(prev, groupId, (g) => {
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

  const showLoginModal = useCallback(
    (
      groupId: string,
      account: AccountBrandRow,
      intent: 'sync' | 'scraper',
      message: import('@/services/syncFlowService').SyncLoginReloginCode,
      knownDbAccountId?: string,
      options?: { purgeHint?: LoginPurgeWaDiskHint },
    ) => {
      void (async () => {
        if (window.electronAPI?.isElectron) {
          await prepareDeviceForPlatformLogin({
            account,
            dbAccountId: knownDbAccountId,
            reloginCode: message,
            purgeHint: options?.purgeHint,
          });
        }

        setLoginModalEpoch((n) => n + 1);
        setTarget({ groupId, account, dbAccountId: knownDbAccountId });
        setLoginIntent(intent);
        setLoginHintCode(message);
        setSyncMessage(null);
        setCheckError(null);
        setStep('platform-login');
        /** Kolom Session tidak diubah — tetap badge Invalid/Valid; bukan "Checking Session". */
      })();
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

  const handleLoginFatalError = useCallback(
    (message: string) => {
      if (!target) return;
      void window.electronAPI?.platformLogin
        ?.cancel(target.account.id, target.account.platform)
        .catch(() => undefined);
      clearRowProcessing(target.groupId, target.account.id);
      setLoginIntent(null);
      showSyncError(message, target.groupId, target.account);
    },
    [clearRowProcessing, showSyncError, target],
  );

  const reportBlockingError = useCallback(
    (message: string) => {
      showSyncError(message);
    },
    [showSyncError],
  );

  const runSyncCheck = useCallback(
    async (groupId: string, account: AccountBrandRow) => {
      if (!canOperatePlatform) return;

      dismissSyncModals();

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

      const lock = tryLockUserAction(account.id, 'sync');
      if (!lock.ok) {
        showSyncError(userActionLockErrorCode(lock), groupId, account);
        return;
      }

      const opensLogin = routeFromSessionColumn(account.sessionStatus) === 'open_login';
      setRowProcessing(
        groupId,
        account.id,
        opensLogin ? 'sync' : 'session_check',
        'sync',
      );

      const stopLoading = () => {
        unlockUserAction(account.id);
        clearRowProcessing(groupId, account.id);
      };

      try {
        const { dbAccountId, outcome } = await runSyncCheckFlow({
          userId,
          account,
          onSessionProbeComplete: opensLogin
            ? undefined
            : () => patchRowProcessAction(groupId, account.id, 'sync'),
        });
        setProcessingDbAccountId(dbAccountId);
        processingDbAccountIdRef.current = dbAccountId;

        if (outcome.kind === 'login') {
          unlockUserAction(account.id);
          patchRowProcessAction(groupId, account.id, 'sync');
          showLoginModal(
            groupId,
            account,
            'sync',
            outcome.reloginCode,
            outcome.dbAccountId,
          );
          return;
        }

        if (outcome.kind === 'invalidated-login') {
          updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
          await recordSyncActivity({
            accountId: outcome.dbAccountId,
            platform: account.platform,
            syncSource: 'manual',
            sessionStatus: 'logout',
            deviceGroups: outcome.invalidResult.groupsCurrent,
            brandGroups: outcome.invalidResult.groupsTotal,
            adminGroups: outcome.invalidResult.adminCurrent,
            message: outcome.deviceMessage,
          });
          await applyResult(groupId, account.id, outcome.invalidResult, {
            masterTotal: outcome.masterJoined,
          });
          unlockUserAction(account.id);
          patchRowProcessAction(groupId, account.id, 'sync');
          showLoginModal(
            groupId,
            account,
            'sync',
            outcome.reloginCode,
            outcome.dbAccountId,
            { purgeHint: 'device_dead' },
          );
          return;
        }

        if (outcome.kind === 'success') {
          await applyResult(groupId, account.id, outcome.result, {
            masterTotal: outcome.masterJoined,
            lastSyncAt: outcome.syncedAt,
          });
          await recordSyncCheckActivity({ dbAccountId: outcome.dbAccountId, account, outcome });

          stopLoading();
          setTarget({
            groupId,
            account: outcome.updatedAccount,
            dbAccountId: outcome.dbAccountId,
          });
          setSyncMessage(outcome.syncMessage);
          setStep(outcome.modalStep);

          const brandId = await fetchBrandIdForAccount(outcome.dbAccountId);
          if (brandId) {
            await onTicketsReload?.(outcome.dbAccountId);
          }
          return;
        }

        stopLoading();
        if (outcome.kind === 'error') {
          showSyncError(outcome.code, groupId, account);
        }
      } catch {
        stopLoading();
        showSyncError('SYNC_FAILED', groupId, account);
      }
    },
    [
      applyResult,
      canOperatePlatform,
      clearRowProcessing,
      dismissSyncModals,
      onTicketsReload,
      patchRowProcessAction,
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

  const runScrapeInBackground = useCallback(
    async (override?: SyncTarget, options?: { skipDeviceCheck?: boolean }) => {
      const ctx = override ?? target;
      if (!ctx || !userId) return;

      const { groupId, account } = ctx;

      const lock = tryLockUserAction(account.id, 'scraper');
      if (!lock.ok) {
        showSyncError(userActionLockErrorCode(lock), groupId, account);
        return;
      }

      setCheckError(null);

      let dbAccountId = ctx.dbAccountId ?? '';

      const bootScrapeUi = async () => {
        const { deviceSessionId, bootProgress } = await prepareScrapeSession({
          account,
          dbAccountId,
          label: t,
        });
        scrapeSessionByAccountRef.current.set(account.id, deviceSessionId);
        setScrapeProgressBySession((prev) => ({
          ...prev,
          [account.id]: bootProgress,
          [deviceSessionId]: bootProgress,
        }));
      };

      let holdRowStateForLogin = false;

      try {
        dbAccountId = await resolveDbAccountId({ userId, account, knownDbAccountId: ctx.dbAccountId });

        const loginNeeded = await resolveScrapeLoginIfNeeded({ userId, account });
        if (loginNeeded) {
          unlockUserAction(account.id);
          patchRowProcessAction(groupId, account.id, 'sync');
          holdRowStateForLogin = true;
          showLoginModal(
            groupId,
            account,
            'scraper',
            loginNeeded.reloginCode,
            loginNeeded.dbAccountId,
          );
          return;
        }

        const skipProbe =
          options?.skipDeviceCheck === true || isAccountInLoginGrace(account.id);

        setRowProcessing(
          groupId,
          account.id,
          skipProbe ? 'scraper' : 'session_check',
          'scraper',
        );

        if (skipProbe) {
          await bootScrapeUi();
        }

        setProcessingDbAccountId(dbAccountId);
        processingDbAccountIdRef.current = dbAccountId;

        const outcome = await runScrapeFlow({
          userId,
          account,
          dbAccountId,
          skipDeviceCheck: options?.skipDeviceCheck === true,
          onSessionProbeComplete: skipProbe
            ? undefined
            : () => {
                patchRowProcessAction(groupId, account.id, 'scraper');
                void bootScrapeUi();
              },
        });

        if (outcome.kind === 'invalidated-login') {
          updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
          await applyResult(groupId, account.id, outcome.invalidResult);
          unlockUserAction(account.id);
          patchRowProcessAction(groupId, account.id, 'sync');
          holdRowStateForLogin = true;
          showLoginModal(
            groupId,
            account,
            'scraper',
            outcome.reloginCode,
            outcome.dbAccountId,
            { purgeHint: 'device_dead' },
          );
          return;
        }

        if (outcome.kind === 'error') {
          if (outcome.needsLogin && outcome.dbAccountId) {
            updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
            unlockUserAction(account.id);
            patchRowProcessAction(groupId, account.id, 'sync');
            holdRowStateForLogin = true;
            showLoginModal(
              groupId,
              account,
              'scraper',
              'SESSION_INVALID_RELOGIN',
              outcome.dbAccountId,
              { purgeHint: 'device_dead' },
            );
            return;
          }
          showSyncError(outcome.message, groupId, account);
          return;
        }

        if (outcome.kind !== 'success') {
          return;
        }

        await applyResult(groupId, account.id, outcome.result, {
          masterTotal: outcome.masterJoined,
          lastSyncAt: outcome.scrapedAt,
        });

        if (outcome.brandX > 0) {
          updateGroups((prev) =>
            patchBrandGroup(prev, groupId, (g) =>
              rebuildGroupMetrics({
                ...g,
                standardGroupCountByPlatform: {
                  ...g.standardGroupCountByPlatform,
                  [account.platform]: outcome.brandX,
                },
                accounts: g.accounts.map((row) =>
                  row.platform === account.platform && row.id !== account.id
                    ? { ...row, groupsTotal: outcome.brandX, adminTotal: outcome.brandX }
                    : row,
                ),
              }),
            ),
          );
        }

        setStep('idle');
        if (dbAccountId) {
          await onTicketsReload?.(dbAccountId);
        }
      } catch (error) {
        const message = getErrorMessage(error, 'SCRAPER_FAILED');
        if (isScrapeCancelledMessage(message)) {
          setTarget({ groupId, account, dbAccountId: dbAccountId || undefined });
          setStep('scrape-cancelled');
          return;
        }
        showSyncError(message, groupId, account);
      } finally {
        unlockUserAction(account.id);
        if (!holdRowStateForLogin) {
          clearScrapeProgress(account.id);
          clearRowProcessing(groupId, account.id);
        }
      }
    },
    [
      applyResult,
      clearScrapeProgress,
      clearRowProcessing,
      onTicketsReload,
      patchRowProcessAction,
      setRowProcessing,
      showLoginModal,
      showSyncError,
      t,
      target,
      updateGroups,
      userId,
    ],
  );

  const confirmScrapePrompt = useCallback(() => {
    if (!target) return;
    const scrapeTarget = target;
    setStep('idle');
    setSyncMessage(null);
    void runScrapeInBackground(scrapeTarget, { skipDeviceCheck: true });
  }, [runScrapeInBackground, target]);

  const dismissScrapePrompt = useCallback(() => {
    dismissSyncModals();
  }, [dismissSyncModals]);

  const requestCancelScrape = useCallback(
    (groupId: string, account: AccountBrandRow) => {
      setTarget({
        groupId,
        account,
        dbAccountId: processingDbAccountIdRef.current ?? undefined,
      });
      setStep('scrape-cancel-confirm');
    },
    [],
  );

  const dismissCancelScrapeConfirm = useCallback(() => {
    setStep('idle');
  }, []);

  const confirmCancelScrape = useCallback(async () => {
    if (!target || !userId) return;

    const { account } = target;
    setStep('idle');

    try {
      let dbAccountId =
        target.dbAccountId ?? processingDbAccountIdRef.current ?? '';
      if (!dbAccountId) {
        dbAccountId = await resolveDbAccountId({
          userId,
          account,
          knownDbAccountId: target.dbAccountId,
        });
      }

      const deviceSessionId = await resolveDeviceSessionId({
        sessionId: account.id,
        platform: account.platform,
        accountId: dbAccountId,
      });

      await window.electronAPI?.scraper?.cancel({
        sessionId: deviceSessionId,
        platform: account.platform,
      });
    } catch {
      // Scrape loop akan reject SCRAPER_CANCELLED; modal sukses dari catch runScrapeInBackground.
    }
  }, [target, userId]);

  const dismissScrapeCancelled = useCallback(() => {
    setStep('idle');
    setTarget(null);
  }, []);

  const handleRunScraper = useCallback(
    async (groupId: string, account: AccountBrandRow) => {
      if (!canOperatePlatform) return;

      dismissSyncModals();
      setTarget({ groupId, account });

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

      void runScrapeInBackground({ groupId, account });
    },
    [canOperatePlatform, dismissSyncModals, runScrapeInBackground, showSyncError, userId],
  );

  const handleLoginSuccess = useCallback(async () => {
    if (!target || !userId) return;

    const { groupId, account } = target;
    const savedIntent = loginIntent;
    setLoginIntent(null);
    setRowProcessing(groupId, account.id, savedIntent === 'scraper' ? 'scraper' : 'sync');

    let persistedToDb = false;
    let dbAccountId = '';

    const armPostLoginGrace = () => {
      markAccountLoginGrace(account.id, POST_LOGIN_GRACE_MS);
      setPostLoginGraceAccountId(account.id);
      window.setTimeout(() => {
        setPostLoginGraceAccountId((current) => (current === account.id ? null : current));
      }, LOGIN_GRACE_MS);
    };

    const startPostLoginScrape = (updatedAccount: AccountBrandRow) => {
      void runScrapeInBackground(
        { groupId, account: updatedAccount, dbAccountId },
        { skipDeviceCheck: true },
      );
    };

    try {
      dbAccountId = await persistSessionAfterLogin({ userId, account });
      persistedToDb = true;
      armPostLoginGrace();
      setStep('idle');

      const metrics = await applyDailyMetricsAfterLogin({ userId, account, dbAccountId });
      await applyResult(groupId, account.id, metrics.result, {
        masterTotal: undefined,
        lastSyncAt: metrics.syncedAt,
      });

      const updatedAccount = metrics.updatedAccount;
      setTarget({ groupId, account: updatedAccount, dbAccountId });

      if (savedIntent === 'scraper') {
        clearRowProcessing(groupId, account.id);
        startPostLoginScrape(updatedAccount);
        return;
      }

      clearRowProcessing(groupId, account.id);
      setStep(
        await resolvePostLoginModalStep({
          account,
          result: metrics.result,
          deviceGroupCount: metrics.deviceGroupCount,
          hasDailyToday: metrics.hasDailyToday,
        }),
      );
      setSyncMessage(metrics.syncMessage);

      const brandId = await fetchBrandIdForAccount(dbAccountId);
      if (brandId) {
        await onTicketsReload?.(dbAccountId);
      }
    } catch (error) {
      const recovered = await recoverLoginMetricsIfPersisted({
        persistedToDb,
        dbAccountId,
        account,
      });

      if (recovered && persistedToDb && dbAccountId) {
        await applyResult(groupId, account.id, recovered.result, {
          masterTotal: recovered.masterJoined,
          lastSyncAt: recovered.syncedAt,
        });
        clearRowProcessing(groupId, account.id);
        setStep('idle');

        if (savedIntent === 'scraper') {
          startPostLoginScrape(recovered.updatedAccount);
          return;
        }

        setStep(
          await resolvePostLoginModalStep({
            account,
            result: recovered.result,
            deviceGroupCount: 0,
            hasDailyToday: false,
          }),
        );
        return;
      }

      clearRowProcessing(groupId, account.id);
      showSyncError(getErrorMessage(error, 'Gagal menyimpan session setelah login'), groupId, account);
      setStep('sync-error');
    }
  }, [
    applyResult,
    clearRowProcessing,
    loginIntent,
    onTicketsReload,
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
        showSyncError(
          getErrorMessage(error, 'Gagal menyimpan nomor telepon'),
          target.groupId,
          target.account,
        );
      } finally {
        setPhoneSaving(false);
      }
    },
    [runSyncCheck, target, updateGroups, userId],
  );

  const activePlatform: Platform | null = target?.account.platform ?? null;

  return {
    processingAccountId,
    processingDbAccountId,
    processingAction,
    postLoginGraceAccountId,
    step,
    target,
    checkError,
    syncMessage,
    loginHintCode,
    loginIntent,
    loginModalEpoch,
    phoneSaving,
    activePlatform,
    handleSyncAccount,
    handleRunScraper,
    requestCancelScrape,
    confirmCancelScrape,
    dismissCancelScrapeConfirm,
    dismissScrapeCancelled,
    confirmScrapePrompt,
    dismissScrapePrompt,
    handleLoginSuccess,
    handleLoginFatalError,
    handleSavePhoneAndSync,
    reportBlockingError,
    closeFlow,
    getScrapeProgress,
  };
}
