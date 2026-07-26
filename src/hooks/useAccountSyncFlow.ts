import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { UiScrapeProgress } from '@/types/scrapeProgress';
import { patchBrandGroup, patchBrandStandardCountForPlatform, setAccountProcessAction, type AccountSyncResult } from '@/lib/accountBrandUtils';
import { applyScrapeMetricsToGroups } from '@/lib/applyScrapeMetricsToGroups';
import { SESSION_SETTLING_CODE } from '@/lib/automationJobQueueClient';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import {
  cancelPlatformLoginForAccount,
  prepareDeviceForPlatformLogin,
  type LoginPurgeWaDiskHint,
} from '@/lib/prepareDeviceForLogin';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { patchAccountSessionInGroups } from '@/lib/accountSessionPatch';
import { recordSyncActivity } from '@/lib/syncActivityLog';
import { markAccountLoginGrace, markAccountScrapeGrace } from '@/lib/sessionRealtimePolicy';
import { recordSessionActivityStatus } from '@/lib/recordSessionActivity';
import { markPlatformSessionSynced } from '@/lib/platformSessions';
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
  acquireExecuteSlot,
  executeSlotErrorCode,
  releaseExecuteSlot,
} from '@/lib/executeSlotClient';
import { resolveAccountExecuteBlock } from '@/lib/automationJobQueueClient';
import { CLEAR_SESSION_REASON, clearAccountSession } from '@/lib/clearAccountSession';
import { isScrapeUserCancelledMessage } from '@/lib/scrapeErrorUi';

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
  /** Modal Scrape now setelah login (bukan setelah sync valid). */
  scrapePromptPostLogin?: boolean;
}

interface UseAccountSyncFlowOptions {
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  userId?: string | null;
  canOperatePlatform?: boolean;
  /** i18n dari parent — hindari hook tambahan di dalam custom hook. */
  translate: (key: string) => string;
  /**
   * Catch-up UI setelah scrape manual sukses (Group Matrix + Operations).
   * Grid akun sudah di-applyResult — jangan refresh DB grid di sini (kontrak §5).
   * Realtime daily sering di-skip saat akun suspended selama scrape.
   */
  onManualScrapeUiCatchUp?: () => void;
}

export type RowProcessingSpinner = 'sync' | 'scraper';

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
  canOperatePlatform = true,
  translate: t,
  onManualScrapeUiCatchUp,
}: UseAccountSyncFlowOptions) {
  const onManualScrapeUiCatchUpRef = useRef(onManualScrapeUiCatchUp);
  onManualScrapeUiCatchUpRef.current = onManualScrapeUiCatchUp;
  const [processingByAccount, setProcessingByAccount] = useState<
    Record<string, RowProcessingSpinner>
  >({});
  /** Spinner per akun (Cancel Run / loading). Grid mirror: row.actionProcess via setRowProcessing. */
  const [postLoginGraceAccountId, setPostLoginGraceAccountId] = useState<string | null>(null);
  const [postLoginCountsReady, setPostLoginCountsReady] = useState(true);
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
  const processingDbByAccountRef = useRef<Map<string, string>>(new Map());
  const scrapeCancelledAccountIdsRef = useRef<Set<string>>(new Set());
  const [processingDbByAccount, setProcessingDbByAccount] = useState<Record<string, string>>({});
  const [scrapeProgressBySession, setScrapeProgressBySession] = useState<
    Record<string, UiScrapeProgress>
  >({});
  const [clearingSessionAccountId, setClearingSessionAccountId] = useState<string | null>(null);

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
            if (scrapeCancelledAccountIdsRef.current.has(accountId)) return prev;
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

  const trackProcessingDbAccount = useCallback((accountId: string, dbAccountId: string) => {
    processingDbByAccountRef.current.set(accountId, dbAccountId);
    setProcessingDbByAccount((prev) => ({ ...prev, [accountId]: dbAccountId }));
  }, []);

  const untrackProcessingDbAccount = useCallback((accountId: string) => {
    processingDbByAccountRef.current.delete(accountId);
    setProcessingDbByAccount((prev) => {
      const { [accountId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const setAccountProcessingSpinner = useCallback(
    (accountId: string, spinner: RowProcessingSpinner | null) => {
      setProcessingByAccount((prev) => {
        if (!spinner) {
          const { [accountId]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [accountId]: spinner };
      });
    },
    [],
  );

  const setRowProcessing = useCallback(
    (
      groupId: string,
      accountId: string,
      rowAction: AccountProcessAction,
      spinner: RowProcessingSpinner | null = null,
    ) => {
      const resolvedSpinner =
        spinner ??
        (rowAction === 'sync' || rowAction === 'scraper' ? rowAction : null);
      if (resolvedSpinner) {
        setAccountProcessingSpinner(accountId, resolvedSpinner);
      }
      updateGroups((groups) =>
        patchBrandGroup(groups, groupId, (group) =>
          setAccountProcessAction(group, accountId, rowAction),
        ),
      );
    },
    [setAccountProcessingSpinner, updateGroups],
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
      setAccountProcessingSpinner(accountId, null);
      untrackProcessingDbAccount(accountId);
      updateGroups((groups) =>
        patchBrandGroup(groups, groupId, (group) => setAccountProcessAction(group, accountId, null)),
      );
    },
    [setAccountProcessingSpinner, untrackProcessingDbAccount, updateGroups],
  );

  const closeFlow = useCallback(() => {
    if (step === 'platform-login' && target) {
      void cancelPlatformLoginForAccount({
        account: target.account,
        dbAccountId: processingDbByAccountRef.current.get(target.account.id),
      });
      clearRowProcessing(target.groupId, target.account.id);
    }
    if (target?.account.id) {
      void releaseExecuteSlot(target.account.id);
      clearScrapeProgress(target.account.id);
      if (processingByAccount[target.account.id]) {
        clearRowProcessing(target.groupId, target.account.id);
      }
    }
    dismissSyncModals();
    setTarget(null);
  }, [
    clearRowProcessing,
    clearScrapeProgress,
    dismissSyncModals,
    processingByAccount,
    step,
    target,
  ]);

  const applyResult = useCallback(
    async (
      groupId: string,
      accountId: string,
      result: AccountSyncResult,
      meta?: {
        masterTotal?: number;
        lastSyncAt?: string | null;
        preserveActionProcess?: boolean;
        preserveSession?: boolean;
        sessionOnly?: boolean;
      },
    ) => {
      await applyScrapeMetricsToGroups(onGroupsChange, groupId, accountId, result, meta);
    },
    [onGroupsChange],
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
      void cancelPlatformLoginForAccount({
        account: target.account,
        dbAccountId: processingDbByAccountRef.current.get(target.account.id),
      });
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

      const executeBlock = await resolveAccountExecuteBlock(account);
      if (executeBlock) {
        showSyncError(executeBlock, groupId, account);
        return;
      }

      if (accountMissingRequiredPhone(account.platform, account.phoneNumber)) {
        setTarget({ groupId, account });
        setCheckError(null);
        setStep('missing-phone');
        return;
      }

      const opensLogin = routeFromSessionColumn(account.sessionStatus) === 'open_login';
      setRowProcessing(
        groupId,
        account.id,
        opensLogin ? 'sync' : 'session_check',
        'sync',
      );

      const slot = await acquireExecuteSlot(account.id, 'sync', account.platform, () => {
        reportBlockingError(t('groupMonitoring.sync.executeSlotsQueued'));
      });
      if (!slot.ok) {
        clearRowProcessing(groupId, account.id);
        showSyncError(executeSlotErrorCode(slot), groupId, account);
        return;
      }

      const stopLoading = () => {
        void releaseExecuteSlot(account.id);
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
        trackProcessingDbAccount(account.id, dbAccountId);

        if (outcome.kind === 'login') {
          void releaseExecuteSlot(account.id);
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

        if (outcome.kind === 'busy') {
          stopLoading();
          showSyncError(outcome.message || SESSION_SETTLING_CODE, groupId, account);
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
          void releaseExecuteSlot(account.id);
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
          markAccountLoginGrace(account.id);
          await applyResult(
            groupId,
            account.id,
            {
              groupsCurrent: account.groupsCurrent,
              groupsTotal: account.groupsTotal,
              adminCurrent: account.adminCurrent,
              adminTotal: account.adminTotal,
              sessionStatus: 'valid',
            },
            {
              sessionOnly: true,
              lastSyncAt: outcome.syncedAt,
              preserveActionProcess: true,
            },
          );
          await recordSyncCheckActivity({ dbAccountId: outcome.dbAccountId, account, outcome });

          stopLoading();
          setTarget({
            groupId,
            account: outcome.updatedAccount,
            dbAccountId: outcome.dbAccountId,
            scrapePromptPostLogin: false,
          });
          setSyncMessage(outcome.syncMessage);
          setStep(outcome.modalStep);
          return;
        }

        stopLoading();
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
      patchRowProcessAction,
      reportBlockingError,
      setRowProcessing,
      showLoginModal,
      showSyncError,
      t,
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

  const handleClearSession = useCallback(
    async (groupId: string, account: AccountBrandRow) => {
      if (!canOperatePlatform || !userId) return;
      if (account.sessionStatus !== 'valid') return;
      if (account.actionProcess) return;

      if (processingByAccount[account.id]) return;

      const slot = await acquireExecuteSlot(account.id, 'sync', account.platform);
      if (!slot.ok) return;

      setClearingSessionAccountId(account.id);

      if (step === 'platform-login' && target?.account.id === account.id) {
        await cancelPlatformLoginForAccount({
          account: target.account,
          dbAccountId: processingDbByAccountRef.current.get(target.account.id),
        });
        dismissSyncModals();
        clearRowProcessing(target.groupId, target.account.id);
        setTarget(null);
      }

      try {
        const { dbAccountId, result } = await clearAccountSession({ userId, account });

        await applyResult(groupId, account.id, result);
        await recordSyncActivity({
          accountId: dbAccountId,
          platform: account.platform,
          syncSource: 'manual',
          sessionStatus: 'logout',
          deviceGroups: result.groupsCurrent,
          brandGroups: result.groupsTotal,
          adminGroups: result.adminCurrent,
          message: CLEAR_SESSION_REASON,
        });
      } catch (error) {
        reportBlockingError(
          getErrorMessage(error, t('groupMonitoring.accountCard.clearSessionFailed')),
        );
      } finally {
        void releaseExecuteSlot(account.id);
        setClearingSessionAccountId(null);
      }
    },
    [
      applyResult,
      canOperatePlatform,
      clearRowProcessing,
      dismissSyncModals,
      processingByAccount,
      reportBlockingError,
      step,
      t,
      target,
      userId,
    ],
  );

  const runScrapeInBackground = useCallback(
    async (
      override?: SyncTarget,
      options?: {
        skipDeviceCheck?: boolean;
        /** Jangan invalidate session DB jika scrape gagal (setelah login / Scrape Now). */
        trustedSession?: boolean;
        /** Kontrak: update Session+Status hanya setelah login; Run valid = false. */
        updateSessionOnSuccess?: boolean;
      },
    ) => {
      const ctx = override ?? target;
      if (!ctx || !userId) return;

      const { groupId, account } = ctx;
      scrapeCancelledAccountIdsRef.current.delete(account.id);

      const executeBlock = await resolveAccountExecuteBlock(account);
      if (executeBlock) {
        showSyncError(executeBlock, groupId, account);
        return;
      }

      const trustedSession = options?.trustedSession === true;
      const updateSessionOnSuccess = options?.updateSessionOnSuccess === true;

      if (trustedSession) {
        markAccountLoginGrace(account.id);
        markAccountScrapeGrace(account.id);
      }

      setRowProcessing(groupId, account.id, 'scraper', 'scraper');

      const slot = await acquireExecuteSlot(account.id, 'scraper', account.platform, () => {
        reportBlockingError(t('groupMonitoring.sync.executeSlotsQueued'));
      });
      if (!slot.ok) {
        clearRowProcessing(groupId, account.id);
        showSyncError(executeSlotErrorCode(slot), groupId, account);
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
      let deferSlotRelease = false;

      try {
        dbAccountId = await resolveDbAccountId({ userId, account, knownDbAccountId: ctx.dbAccountId });

        const loginNeeded = await resolveScrapeLoginIfNeeded({ userId, account });
        if (loginNeeded) {
          void releaseExecuteSlot(account.id);
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

        const skipProbe = options?.skipDeviceCheck === true;

        setRowProcessing(
          groupId,
          account.id,
          skipProbe ? 'scraper' : 'session_check',
          'scraper',
        );

        if (skipProbe) {
          await bootScrapeUi();
        }

        trackProcessingDbAccount(account.id, dbAccountId);

        const outcome = await runScrapeFlow({
          userId,
          account,
          dbAccountId,
          skipDeviceCheck: options?.skipDeviceCheck === true,
          trustedSession,
          updateSessionOnSuccess,
          onSessionProbeComplete: skipProbe
            ? undefined
            : () => {
                patchRowProcessAction(groupId, account.id, 'scraper');
                void bootScrapeUi();
              },
        });

        if (outcome.kind === 'invalidated-login' && !trustedSession) {
          updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
          await applyResult(groupId, account.id, outcome.invalidResult);
          void releaseExecuteSlot(account.id);
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

        if (outcome.kind === 'device_busy') {
          void releaseExecuteSlot(account.id);
          clearRowProcessing(groupId, account.id);
          showSyncError(outcome.message || SESSION_SETTLING_CODE, groupId, account);
          return;
        }

        if (outcome.kind === 'error') {
          if (outcome.needsLogin && outcome.dbAccountId && !trustedSession) {
            updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'invalid'));
            void releaseExecuteSlot(account.id);
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
          deferSlotRelease = true;
          showSyncError(outcome.message, groupId, account);
          return;
        }

        if (outcome.kind !== 'success') {
          return;
        }

        await applyResult(groupId, account.id, outcome.result, {
          masterTotal: outcome.masterJoined,
          lastSyncAt: outcome.scrapedAt,
          preserveActionProcess: true,
          preserveSession: !outcome.updateSession,
        });

        if (outcome.brandX > 0) {
          updateGroups((prev) =>
            patchBrandStandardCountForPlatform(
              prev,
              groupId,
              account.platform,
              account.id,
              outcome.brandX,
            ),
          );
        }

        markAccountScrapeGrace(account.id);
        await recordSyncActivity({
          accountId: outcome.dbAccountId,
          platform: account.platform,
          syncSource: 'manual',
          sessionStatus: 'valid',
          deviceGroups: outcome.result.groupsCurrent,
          brandGroups: outcome.result.groupsTotal,
          adminGroups: outcome.result.adminCurrent,
          message: `scrape:${outcome.result.groupsCurrent}/${outcome.result.groupsTotal}`,
        });

        // Realtime daily/master sering di-drop saat akun suspended — catch-up Matrix/Ops.
        onManualScrapeUiCatchUpRef.current?.();

        if (outcome.warningCode) {
          deferSlotRelease = true;
          showSyncError(outcome.warningCode, groupId, account);
          return;
        }

        setStep('idle');
      } catch (error) {
        const message = getErrorMessage(error, 'SCRAPER_FAILED');
        if (isScrapeUserCancelledMessage(message)) {
          if (!scrapeCancelledAccountIdsRef.current.has(account.id)) {
            setTarget({ groupId, account, dbAccountId: dbAccountId || undefined });
            setStep('scrape-cancelled');
          }
          return;
        }
        showSyncError(message, groupId, account);
        deferSlotRelease = true;
      } finally {
        if (!holdRowStateForLogin) {
          // Slot selalu dilepas (anti-stuck); spinner boleh ditahan sampai modal error ditutup.
          void releaseExecuteSlot(account.id);
          if (!deferSlotRelease) {
            clearScrapeProgress(account.id);
            clearRowProcessing(groupId, account.id);
          }
        }
      }
    },
    [
      applyResult,
      clearScrapeProgress,
      clearRowProcessing,
      patchRowProcessAction,
      reportBlockingError,
      setRowProcessing,
      showLoginModal,
      showSyncError,
      t,
      target,
      updateGroups,
      userId,
    ],
  );

  const confirmScrapePrompt = useCallback(async () => {
    if (!target) return;
    const { groupId, account } = target;

    /** Lindungi dari event invalid realtime saat scrape — bukan skip probe. */
    markAccountScrapeGrace(account.id);
    setStep('idle');
    setSyncMessage(null);
    setRowProcessing(groupId, account.id, 'scraper', 'scraper');
    /**
     * Sync barusan Check Session ke device → Valid.
     * Scrape Now = execute scrape real (bukan probe singkat lagi).
     * trustedSession false: unlink → Login; connect fail → notif jelas.
     */
    void runScrapeInBackground(target, {
      skipDeviceCheck: true,
      trustedSession: false,
      updateSessionOnSuccess: false,
    });
  }, [runScrapeInBackground, setRowProcessing, target]);

  /**
   * Later: hanya pastikan session Active/Valid di UI lokal + DB.
   * Tidak scrape, tidak count device — hindari busy/timeout akun banyak grup.
   */
  const dismissScrapePrompt = useCallback(() => {
    if (!target) {
      dismissSyncModals();
      setTarget(null);
      return;
    }

    const { groupId, account, dbAccountId } = target;
    const syncedAt = new Date().toISOString();

    updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'valid'));
    void applyResult(
      groupId,
      account.id,
      {
        groupsCurrent: account.groupsCurrent,
        groupsTotal: account.groupsTotal,
        adminCurrent: account.adminCurrent,
        adminTotal: account.adminTotal,
        sessionStatus: 'valid',
      },
      {
        sessionOnly: true,
        lastSyncAt: syncedAt,
      },
    );
    if (dbAccountId) {
      void markPlatformSessionSynced(dbAccountId);
    }

    clearRowProcessing(groupId, account.id);
    void releaseExecuteSlot(account.id);
    dismissSyncModals();
    setTarget(null);
  }, [applyResult, clearRowProcessing, dismissSyncModals, target, updateGroups]);

  const requestCancelScrape = useCallback(
    (groupId: string, account: AccountBrandRow) => {
      setTarget({
        groupId,
        account,
        dbAccountId: processingDbByAccountRef.current.get(account.id),
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

    const { groupId, account } = target;
    scrapeCancelledAccountIdsRef.current.add(account.id);
    setStep('scrape-cancelled');

    try {
      let dbAccountId =
        target.dbAccountId ?? processingDbByAccountRef.current.get(account.id) ?? '';
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

      // Abort device dulu — baru lepaskan execute slot (hindari race Chrome masih jalan).
      await window.electronAPI?.scraper?.cancel({
        sessionId: deviceSessionId,
        platform: account.platform,
      });
    } catch {
      // Tetap bersihkan UI/slot di finally.
    } finally {
      void releaseExecuteSlot(account.id);
      clearScrapeProgress(account.id);
      clearRowProcessing(groupId, account.id);
    }
  }, [clearRowProcessing, clearScrapeProgress, target, userId]);

  const dismissScrapeCancelled = useCallback(() => {
    setStep('idle');
    setTarget(null);
  }, []);

  const handleLoginSuccess = useCallback(async () => {
    if (!target || !userId) return;

    const { groupId, account } = target;
    const savedIntent = loginIntent;
    setLoginIntent(null);
    setRowProcessing(groupId, account.id, savedIntent === 'scraper' ? 'scraper' : 'sync');
    markAccountLoginGrace(account.id, POST_LOGIN_GRACE_MS);
    setPostLoginGraceAccountId(account.id);
    const postLoginGraceTotalMs = POST_LOGIN_GRACE_MS;
    window.setTimeout(() => {
      setPostLoginGraceAccountId((current) => (current === account.id ? null : current));
    }, postLoginGraceTotalMs);
    updateGroups((prev) => patchAccountSessionInGroups(prev, account.id, 'valid'));
    setStep('idle');

    let persistedToDb = false;
    let dbAccountId = '';

    const startPostLoginScrape = (updatedAccount: AccountBrandRow) => {
      void runScrapeInBackground(
        { groupId, account: updatedAccount, dbAccountId },
        {
          skipDeviceCheck: true,
          trustedSession: true,
          updateSessionOnSuccess: true,
        },
      );
    };

    try {
      dbAccountId = await persistSessionAfterLogin({ userId, account });
      persistedToDb = true;
      await markPlatformSessionSynced(dbAccountId);
      await recordSessionActivityStatus({
        accountId: dbAccountId,
        platform: account.platform,
        sessionStatus: 'valid',
        eventType: 'login_success',
        message: 'Login QR success',
      });

      const metrics = await applyDailyMetricsAfterLogin({ account, dbAccountId });
      await applyResult(
        groupId,
        account.id,
        {
          groupsCurrent: account.groupsCurrent,
          groupsTotal: account.groupsTotal,
          adminCurrent: account.adminCurrent,
          adminTotal: account.adminTotal,
          sessionStatus: 'valid',
        },
        {
          sessionOnly: true,
          lastSyncAt: metrics.syncedAt,
          preserveActionProcess: true,
        },
      );

      const updatedAccount = metrics.updatedAccount;
      setTarget({
        groupId,
        account: updatedAccount,
        dbAccountId,
        scrapePromptPostLogin: true,
      });

      if (savedIntent === 'scraper') {
        clearRowProcessing(groupId, account.id);
        startPostLoginScrape(updatedAccount);
        return;
      }

      clearRowProcessing(groupId, account.id);
      setPostLoginCountsReady(metrics.countsReady);
      setStep(
        await resolvePostLoginModalStep({
          account,
          result: metrics.result,
          deviceGroupCount: metrics.deviceGroupCount,
          hasDailyToday: metrics.hasDailyToday,
        }),
      );
      setSyncMessage(metrics.syncMessage);
    } catch (error) {
      const recovered = await recoverLoginMetricsIfPersisted({
        persistedToDb,
        dbAccountId,
        account,
      });

      if (recovered && persistedToDb && dbAccountId) {
        await applyResult(
          groupId,
          account.id,
          {
            groupsCurrent: account.groupsCurrent,
            groupsTotal: account.groupsTotal,
            adminCurrent: account.adminCurrent,
            adminTotal: account.adminTotal,
            sessionStatus: 'valid',
          },
          {
            sessionOnly: true,
            lastSyncAt: recovered.syncedAt,
            preserveActionProcess: true,
          },
        );
        clearRowProcessing(groupId, account.id);
        setStep('idle');

        if (savedIntent === 'scraper') {
          startPostLoginScrape(recovered.updatedAccount);
          return;
        }

        setPostLoginCountsReady(false);
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
    runScrapeInBackground,
    setRowProcessing,
    showSyncError,
    target,
    updateGroups,
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

  /** Dipanggil dari job queue post-join — scrape lane user tanpa prompt. */
  const triggerScrapeForAccount = useCallback(
    (groupId: string, account: AccountBrandRow) => {
      if (processingByAccount[account.id]) return;
      void runScrapeInBackground(
        { groupId, account },
        { skipDeviceCheck: true, updateSessionOnSuccess: false },
      );
    },
    [processingByAccount, runScrapeInBackground],
  );

  const activePlatform: Platform | null = target?.account.platform ?? null;

  return {
    processingByAccount,
    processingDbByAccount,
    postLoginGraceAccountId,
    postLoginCountsReady,
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
    handleClearSession,
    clearingSessionAccountId,
    requestCancelScrape,
    confirmCancelScrape,
    dismissCancelScrapeConfirm,
    dismissScrapeCancelled,
    confirmScrapePrompt,
    dismissScrapePrompt,
    handleLoginSuccess,
    handleLoginFatalError,
    handleSavePhoneAndSync,
    triggerScrapeForAccount,
    reportBlockingError,
    closeFlow,
    getScrapeProgress,
  };
}

export type AccountSyncFlowApi = ReturnType<typeof useAccountSyncFlow>;
