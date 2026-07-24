import { useCallback, useEffect, useRef, useState } from 'react';
import { CREATE_GROUP_MAX_PER_ACCOUNT_RUN, isMasterOpsRole } from '@/config/accountOpsRole';
import { buildAutomationJobRunContext } from '@/lib/automationJobRunContext';
import {
  clampCreateGroupTotalToMax,
  createGroupDayUsageForAccount,
  shouldHideCreateAccountFromSelect,
} from '@/lib/createGroupAccountEligibility';
import { resolveCurrentUserId } from '@/lib/brandGroupPhotoStorage';
import {
  enqueueAndTryRunAutomationJob,
  fetchJobQueueSnapshot,
  subscribeJobQueueChanged,
} from '@/lib/automationJobQueueClient';
import { automationJobBusyGroupIdSet } from '@/lib/automationJobBusyGroups';
import { exitDeleteProcessedGroupIdSet } from '@/lib/exitDeleteFlow';
import { loadMissingMasterGroupsJoinSnapshot } from '@/lib/loadMissingMasterGroupsForJoin';
import {
  loadAccountExitGroupsSnapshot,
  type AccountExitGroupsSnapshot,
} from '@/lib/loadAccountDailyGroupsForLeaveDelete';
import {
  loadSuperAdminGroupsForSetAdmin,
  type SuperAdminGroupForSetAdmin,
} from '@/lib/loadSuperAdminGroupsForSetAdmin';
import {
  readTelegramWorkerSettings,
  readWhatsAppWorkerSettings,
  toLeaveDeleteJobPayload,
  toTelegramAdminRightsPayload,
} from '@/config/workerPlatformSettings';
import { buildCreateGroupEnqueueFromJobDraft } from '@/lib/createGroupWorkerSettings';
import {
  enqueueErrorResult,
  isEnqueueErrorResult,
} from '@/lib/operationsJobQueueEnqueueResult';
import { mapEnqueueJobQueueError } from '@/lib/mapEnqueueJobQueueError';
import type {
  JobQueueCreateGroupDraft,
  JobQueueSetAdminDraft,
} from '@/components/group-monitoring/OperationsJobQueueSetupModal';
import type { JobQueueTaskType } from '@/lib/operationsJobQueueUi';
import type { MissingMasterGroupForJoin } from '@/lib/loadMissingMasterGroupsForJoin';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export interface UseJobQueueSetupEnqueueArgs {
  open: boolean;
  taskType: JobQueueTaskType;
  platform: Platform;
  activeBrand: string;
  selectedAccounts: AccountBrandRow[];
  superAdminAccount: AccountBrandRow | undefined;
  /** Semua akun valid brand+platform (untuk filter target set_admin). */
  validAccounts: AccountBrandRow[];
  t: (key: string, params?: Record<string, string | number>) => string;
  onFeedback?: (message: string) => void;
}

function returnEnqueueError(
  error: string,
  t: (key: string) => string,
  onFeedback?: (message: string) => void,
): string {
  const message = mapEnqueueJobQueueError(error, t);
  onFeedback?.(message);
  return enqueueErrorResult(message);
}

/**
 * Shared load + enqueue untuk Job Queue Setup modal.
 * Dipakai Account tab dan Operations AddBar — supaya Ops shell bisa dihapus nanti.
 */
export function useJobQueueSetupEnqueue({
  open,
  taskType,
  platform,
  activeBrand,
  selectedAccounts,
  superAdminAccount,
  validAccounts,
  t,
  onFeedback,
}: UseJobQueueSetupEnqueueArgs) {
  const [joinableGroups, setJoinableGroups] = useState<MissingMasterGroupForJoin[]>([]);
  const [joinGroupAccountIds, setJoinGroupAccountIds] = useState<Record<string, string[]>>({});
  const [loadingJoinGroups, setLoadingJoinGroups] = useState(false);
  const [superAdminGroups, setSuperAdminGroups] = useState<SuperAdminGroupForSetAdmin[]>([]);
  const [loadingSuperAdminGroups, setLoadingSuperAdminGroups] = useState(false);
  const [accountExitGroups, setAccountExitGroups] = useState<AccountExitGroupsSnapshot>({
    daily: [],
    junk: [],
  });
  const [processedExitGroupIds, setProcessedExitGroupIds] = useState<Set<string>>(() => new Set());
  const [loadingAccountDailyGroups, setLoadingAccountDailyGroups] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  function beginSubmitting(): void {
    submittingRef.current = true;
    setSubmitting(true);
  }

  function endSubmitting(): void {
    submittingRef.current = false;
    setSubmitting(false);
  }

  const selectedAccountId = selectedAccounts[0]?.id ?? '';
  const superAdminAccountId = superAdminAccount?.id ?? '';

  const reloadMissingGroups = useCallback(async () => {
    const accountIds = selectedAccounts.map((row) => row.id);
    if (!activeBrand || accountIds.length === 0) {
      setJoinableGroups([]);
      setJoinGroupAccountIds({});
      return;
    }

    setLoadingJoinGroups(true);
    try {
      const queueSnapshot = await fetchJobQueueSnapshot({ brandName: activeBrand, platform });
      const merged = new Map<string, MissingMasterGroupForJoin>();
      const eligibleByGroup: Record<string, string[]> = {};

      const snapshots = await Promise.all(
        accountIds.map((accountId) =>
          loadMissingMasterGroupsJoinSnapshot({
            accountId,
            brandName: activeBrand,
            platform,
          }),
        ),
      );

      accountIds.forEach((accountId, index) => {
        const snapshot = snapshots[index];
        const busyGroupIds = automationJobBusyGroupIdSet(queueSnapshot?.jobs ?? [], (job) =>
          job.accountId === accountId &&
          job.action === 'join_by_invite_link' &&
          (job.status === 'queued' || job.status === 'running'),
        );
        for (const row of snapshot.joinable) {
          if (busyGroupIds.has(row.groupId)) continue;
          merged.set(row.groupId, row);
          if (!eligibleByGroup[row.groupId]) eligibleByGroup[row.groupId] = [];
          eligibleByGroup[row.groupId].push(accountId);
        }
      });

      setJoinableGroups(
        [...merged.values()].sort((a, b) => a.groupName.localeCompare(b.groupName)),
      );
      setJoinGroupAccountIds(eligibleByGroup);
    } catch {
      setJoinableGroups([]);
      setJoinGroupAccountIds({});
      if (open) onFeedback?.(t('operations.jobQueue.loadMissingFailed'));
    } finally {
      setLoadingJoinGroups(false);
    }
  }, [activeBrand, onFeedback, open, platform, selectedAccounts, t]);

  const reloadSuperAdminGroups = useCallback(async () => {
    if (!activeBrand || !superAdminAccountId) {
      setSuperAdminGroups([]);
      return;
    }

    const accountValid = validAccounts.some((row) => row.id === superAdminAccountId);
    if (!accountValid) {
      setSuperAdminGroups([]);
      return;
    }

    setLoadingSuperAdminGroups(true);
    try {
      const rows = await loadSuperAdminGroupsForSetAdmin({
        accountId: superAdminAccountId,
        brandName: activeBrand,
        platform,
      });
      const queueSnapshot = await fetchJobQueueSnapshot({ brandName: activeBrand, platform });
      const busyGroupIds = automationJobBusyGroupIdSet(queueSnapshot?.jobs ?? [], (job) =>
        job.accountId === superAdminAccountId &&
        job.action === 'set_admin' &&
        (job.status === 'queued' || job.status === 'running'),
      );
      setSuperAdminGroups(rows.filter((row) => !busyGroupIds.has(row.groupId)));
    } catch {
      setSuperAdminGroups([]);
      if (open) onFeedback?.(t('operations.jobQueue.loadMissingFailed'));
    } finally {
      setLoadingSuperAdminGroups(false);
    }
  }, [activeBrand, onFeedback, open, platform, superAdminAccountId, t, validAccounts]);

  const reloadAccountExitGroups = useCallback(async (options?: { silent?: boolean }) => {
    if (!activeBrand || !selectedAccountId || taskType !== 'exit_delete_group') {
      setAccountExitGroups({ daily: [], junk: [] });
      setProcessedExitGroupIds(new Set());
      return;
    }

    const accountValid = validAccounts.some((row) => row.id === selectedAccountId);
    if (!accountValid) {
      setAccountExitGroups({ daily: [], junk: [] });
      setProcessedExitGroupIds(new Set());
      return;
    }

    if (!options?.silent) {
      setLoadingAccountDailyGroups(true);
    }
    try {
      const snapshot = await loadAccountExitGroupsSnapshot({
        accountId: selectedAccountId,
        brandName: activeBrand,
        platform,
      });
      const queueSnapshot = await fetchJobQueueSnapshot({ brandName: activeBrand, platform });
      setProcessedExitGroupIds(
        exitDeleteProcessedGroupIdSet(queueSnapshot?.jobs ?? [], selectedAccountId),
      );
      setAccountExitGroups({
        daily: snapshot.daily,
        junk: snapshot.junk,
      });
    } catch {
      setAccountExitGroups({ daily: [], junk: [] });
      setProcessedExitGroupIds(new Set());
      if (open) onFeedback?.(t('operations.jobQueue.loadDailyGroupsFailed'));
    } finally {
      setLoadingAccountDailyGroups(false);
    }
  }, [
    activeBrand,
    onFeedback,
    open,
    platform,
    selectedAccountId,
    t,
    taskType,
    validAccounts,
  ]);

  useEffect(() => {
    if (taskType !== 'join' || !open) return;
    void reloadMissingGroups();
  }, [taskType, open, reloadMissingGroups]);

  useEffect(() => {
    if (taskType !== 'set_admin' || !open) return;
    void reloadSuperAdminGroups();
  }, [taskType, open, reloadSuperAdminGroups]);

  useEffect(() => {
    if (taskType !== 'exit_delete_group' || !open) return;
    void reloadAccountExitGroups();
  }, [taskType, open, reloadAccountExitGroups]);

  useEffect(() => {
    return subscribeJobQueueChanged(() => {
      if (submittingRef.current || open) return;
      if (taskType === 'join') void reloadMissingGroups();
      if (taskType === 'set_admin') void reloadSuperAdminGroups();
      if (taskType === 'exit_delete_group') void reloadAccountExitGroups({ silent: true });
    });
  }, [open, taskType, reloadAccountExitGroups, reloadMissingGroups, reloadSuperAdminGroups]);

  async function saveJoinBatch(groupIds: string[]): Promise<string | null> {
    if (selectedAccounts.length === 0 || groupIds.length === 0) return null;

    const workerSettings =
      platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
    const maxPerRun = Math.max(1, workerSettings.inviteLink.maxPerRun || 20);

    const groupsByAccount = new Map<
      string,
      Array<{ groupId: string; groupName: string; inviteLink: string }>
    >();

    for (const groupId of groupIds) {
      const group = joinableGroups.find((row) => row.groupId === groupId);
      if (!group) continue;

      const eligibleIds = new Set(joinGroupAccountIds[group.groupId] ?? []);
      for (const account of selectedAccounts) {
        if (!eligibleIds.has(account.id)) continue;
        const list = groupsByAccount.get(account.id) ?? [];
        list.push({
          groupId: group.groupId,
          groupName: group.groupName,
          inviteLink: group.inviteLink,
        });
        groupsByAccount.set(account.id, list);
      }
    }

    beginSubmitting();
    let queuedJobs = 0;
    let totalGroups = 0;

    try {
      for (const account of selectedAccounts) {
        const allGroups = groupsByAccount.get(account.id) ?? [];
        if (allGroups.length === 0) continue;

        const chunks: Array<typeof allGroups> = [];
        for (let i = 0; i < allGroups.length; i += maxPerRun) {
          chunks.push(allGroups.slice(i, i + maxPerRun));
        }

        const ctx = await buildAutomationJobRunContext(account, 'join_by_invite_link');
        const needsSplit = chunks.length > 1;
        for (const chunk of chunks) {
          const result = await enqueueAndTryRunAutomationJob({
            brandName: activeBrand,
            platform,
            accountId: account.id,
            accountName: account.accountName,
            sessionId: ctx.sessionId,
            action: 'join_by_invite_link',
            payload: { groups: chunk },
            storedSessionString: ctx.storedSessionString,
            expectedPhone: ctx.expectedPhone,
            delay: ctx.delay,
            allowMultipleQueued: needsSplit,
          });
          if (!result.ok) {
            return returnEnqueueError(result.error, t, onFeedback);
          }
          queuedJobs += 1;
          totalGroups += chunk.length;
        }
      }

      if (queuedJobs > 0) {
        return t('operations.jobQueue.queuedJoinAccountsOk', {
          accounts: queuedJobs,
          groups: totalGroups,
        });
      }
      return null;
    } finally {
      endSubmitting();
    }
  }

  async function saveJoinCsvBatch(
    groups: Array<{ groupId: string; groupName: string; inviteLink: string }>,
  ): Promise<string | null> {
    if (selectedAccounts.length === 0 || groups.length === 0) return null;

    const workerSettings =
      platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
    const maxPerRun = Math.max(1, workerSettings.inviteLink.maxPerRun || 20);

    beginSubmitting();
    let queuedJobs = 0;
    let totalGroups = 0;

    try {
      for (const account of selectedAccounts) {
        const chunks: Array<typeof groups> = [];
        for (let i = 0; i < groups.length; i += maxPerRun) {
          chunks.push(groups.slice(i, i + maxPerRun));
        }

        const ctx = await buildAutomationJobRunContext(account, 'join_by_invite_link');
        const needsSplit = chunks.length > 1;
        for (const chunk of chunks) {
          const result = await enqueueAndTryRunAutomationJob({
            brandName: activeBrand,
            platform,
            accountId: account.id,
            accountName: account.accountName,
            sessionId: ctx.sessionId,
            action: 'join_by_invite_link',
            payload: { groups: chunk },
            storedSessionString: ctx.storedSessionString,
            expectedPhone: ctx.expectedPhone,
            delay: ctx.delay,
            allowMultipleQueued: needsSplit,
          });
          if (!result.ok) {
            return returnEnqueueError(result.error, t, onFeedback);
          }
          queuedJobs += 1;
          totalGroups += chunk.length;
        }
      }

      if (queuedJobs > 0) {
        return t('operations.jobQueue.queuedJoinAccountsOk', {
          accounts: queuedJobs,
          groups: totalGroups,
        });
      }
      return null;
    } finally {
      endSubmitting();
    }
  }

  async function saveCreateBatch(draft: JobQueueCreateGroupDraft): Promise<string | null> {
    const workerSettings =
      platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
    const maxPerRun = Math.min(
      CREATE_GROUP_MAX_PER_ACCOUNT_RUN,
      Math.max(1, workerSettings.standard.perRun || CREATE_GROUP_MAX_PER_ACCOUNT_RUN),
    );
    const totalToCreate = clampCreateGroupTotalToMax(draft.totalToCreate, maxPerRun);

    if (selectedAccounts.length === 0 || !activeBrand) return null;

    for (const account of selectedAccounts) {
      if (!isMasterOpsRole(account.opsRole)) {
        onFeedback?.(t('operations.jobQueue.createAccountNotCreator'));
        return null;
      }
    }

    const snapshot = await fetchJobQueueSnapshot({ platform });
    const createJobs = (snapshot?.jobs ?? []).filter((job) => job.action === 'create_group');
    for (const account of selectedAccounts) {
      const usage = createGroupDayUsageForAccount(createJobs, account.id);
      if (shouldHideCreateAccountFromSelect(usage, maxPerRun)) {
        onFeedback?.(t('operations.jobQueue.createAccountHiddenToday'));
        return null;
      }
    }

    let enqueueSettings: ReturnType<typeof buildCreateGroupEnqueueFromJobDraft>;
    try {
      enqueueSettings = buildCreateGroupEnqueueFromJobDraft(platform, {
        createGroupSettings: draft.createGroupSettings,
        hideChatHistoryForMembers: draft.hideChatHistoryForMembers,
      });
    } catch {
      return returnEnqueueError('ENQUEUE_FAILED', t, onFeedback);
    }

    beginSubmitting();
    let queued = 0;
    try {
      const currentUserId = await resolveCurrentUserId();
      for (const account of selectedAccounts) {
        const ctx = await buildAutomationJobRunContext(account, 'create_group');
        const result = await enqueueAndTryRunAutomationJob({
          brandName: activeBrand,
          platform,
          accountId: account.id,
          accountName: account.accountName,
          sessionId: ctx.sessionId,
          action: 'create_group',
          payload: {
            groupName: draft.groupName,
            groupNamePrefix: draft.groupName,
            totalToCreate,
            useGroupNumbering: draft.useGroupNumbering,
            startFrom: draft.startFrom,
            perRun: maxPerRun,
            hideChatHistory: enqueueSettings.hideChatHistoryForMembers,
            createGroupSettings: enqueueSettings.createGroupSettings,
            photoPath: draft.photoPath,
            userId: currentUserId ?? undefined,
          },
          storedSessionString: ctx.storedSessionString,
          expectedPhone: ctx.expectedPhone,
          delay: ctx.delay,
        });

        if (!result.ok) {
          return returnEnqueueError(result.error, t, onFeedback);
        }
        queued += 1;
      }

      if (queued > 0) {
        return t('operations.jobQueue.queuedCreateBatchOk', { total: totalToCreate });
      }
      return null;
    } finally {
      endSubmitting();
    }
  }

  async function saveSetAdminBatch(draft: JobQueueSetAdminDraft): Promise<string | null> {
    if (!superAdminAccount) return null;

    const targetAccounts = validAccounts.filter(
      (row) =>
        draft.targetAccountIds.includes(row.id) &&
        row.id !== superAdminAccount.id &&
        row.phoneNumber?.trim(),
    );
    if (!targetAccounts.length || !draft.groupIds.length) return null;

    const targets = targetAccounts.map((row) => row.phoneNumber.trim()).filter(Boolean);
    const workerSettings =
      platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
    const maxPerRun = Math.max(1, workerSettings.inviteLink.maxPerRun || 30);

    beginSubmitting();
    try {
      const allGroups = draft.groupIds.map((groupId) => {
        const group = superAdminGroups.find((row) => row.groupId === groupId);
        const inviteLink = group?.inviteLink?.trim() || undefined;
        return {
          groupId,
          groupName: group?.groupName ?? groupId,
          inviteLink,
          groupLink: platform === 'telegram' ? inviteLink : undefined,
        };
      });

      const chunks: Array<typeof allGroups> = [];
      for (let i = 0; i < allGroups.length; i += maxPerRun) {
        chunks.push(allGroups.slice(i, i + maxPerRun));
      }

      const ctx = await buildAutomationJobRunContext(superAdminAccount, 'set_admin');
      const needsSplit = chunks.length > 1;
      let queuedJobs = 0;

      for (const chunk of chunks) {
        const result = await enqueueAndTryRunAutomationJob({
          brandName: activeBrand,
          platform,
          accountId: superAdminAccount.id,
          accountName: superAdminAccount.accountName,
          sessionId: ctx.sessionId,
          action: 'set_admin',
          payload: {
            groups: chunk,
            targets,
            targetAccountNames: targetAccounts.map((row) => row.accountName),
            adminRights:
              platform === 'telegram' ? toTelegramAdminRightsPayload(workerSettings) : undefined,
          },
          storedSessionString: ctx.storedSessionString,
          expectedPhone: ctx.expectedPhone,
          delay: ctx.delay,
          allowMultipleQueued: needsSplit,
        });
        if (!result.ok) {
          return returnEnqueueError(result.error, t, onFeedback);
        }
        queuedJobs += 1;
      }

      if (queuedJobs > 0) {
        return t('operations.jobQueue.queuedSetAdminOk', { count: allGroups.length });
      }
      return null;
    } finally {
      endSubmitting();
    }
  }

  async function saveExitBatch(groupIds: string[]): Promise<string | null> {
    if (selectedAccounts.length !== 1 || groupIds.length === 0) return null;

    const account = selectedAccounts[0];
    const workerSettings =
      platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
    const maxPerRun = Math.max(1, workerSettings.inviteLink.maxPerRun || 30);

    if (!workerSettings.leaveDelete.leaveEnabled) {
      const message = t('operations.jobQueue.exitLeaveDisabledInSettings');
      onFeedback?.(message);
      return enqueueErrorResult(message);
    }

    /** Daily + junk — CTA Account junk / tab Exit junk harus bisa di-enqueue. */
    const exitGroupById = new Map<string, (typeof accountExitGroups.daily)[number]>();
    for (const group of accountExitGroups.daily) {
      exitGroupById.set(group.groupId, group);
    }
    for (const group of accountExitGroups.junk) {
      if (!exitGroupById.has(group.groupId)) exitGroupById.set(group.groupId, group);
    }

    const selectedGroups = groupIds
      .filter((groupId) => exitGroupById.has(groupId))
      .map((groupId) => {
        const group = exitGroupById.get(groupId)!;
        const inviteLink = group.inviteLink?.trim() || undefined;
        return {
          groupId,
          groupName: group.groupName ?? groupId,
          inviteLink,
          groupLink: platform === 'telegram' ? inviteLink : undefined,
        };
      });

    if (selectedGroups.length === 0) return null;

    const alreadyProcessed = groupIds.filter((groupId) => processedExitGroupIds.has(groupId));
    if (alreadyProcessed.length > 0) {
      const message = t('operations.jobQueue.exitGroupAlreadyProcessed');
      onFeedback?.(message);
      return enqueueErrorResult(message);
    }

    const chunks: Array<typeof selectedGroups> = [];
    for (let i = 0; i < selectedGroups.length; i += maxPerRun) {
      chunks.push(selectedGroups.slice(i, i + maxPerRun));
    }

    beginSubmitting();
    try {
      const ctx = await buildAutomationJobRunContext(account, 'leave_group');
      const needsSplit = chunks.length > 1;
      let queuedJobs = 0;

      for (const chunk of chunks) {
        const result = await enqueueAndTryRunAutomationJob({
          brandName: activeBrand,
          platform,
          accountId: account.id,
          accountName: account.accountName,
          sessionId: ctx.sessionId,
          action: 'leave_group',
          payload: {
            groups: chunk,
            exitDeletePhase: 'exit',
            leaveDelete: {
              ...toLeaveDeleteJobPayload(workerSettings),
              /** Dipakai auto-delete after left; false = jangan auto enqueue delete. */
              deleteEnabled: workerSettings.leaveDelete.deleteEnabled,
            },
          },
          storedSessionString: ctx.storedSessionString,
          expectedPhone: ctx.expectedPhone,
          delay: ctx.delay,
          allowMultipleQueued: needsSplit,
        });
        if (!result.ok) {
          return returnEnqueueError(result.error, t, onFeedback);
        }
        queuedJobs += 1;
      }

      if (queuedJobs > 0) {
        return t('operations.jobQueue.queuedExitOk', { count: selectedGroups.length });
      }
      return null;
    } finally {
      endSubmitting();
    }
  }

  return {
    joinableGroups,
    joinGroupAccountIds,
    loadingJoinGroups,
    superAdminGroups,
    loadingSuperAdminGroups,
    accountExitGroups,
    processedExitGroupIds,
    loadingAccountDailyGroups,
    submitting,
    saveJoinBatch,
    saveJoinCsvBatch,
    saveCreateBatch,
    saveSetAdminBatch,
    saveExitBatch,
    isEnqueueErrorResult,
  };
}
