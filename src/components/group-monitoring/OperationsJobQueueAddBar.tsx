import { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import { DarkSelect } from '@/components/ui/DarkSelect';
import {
  OperationsJobQueueSetupModal,
  type JobQueueCreateGroupDraft,
  type JobQueueSetAdminDraft,
} from '@/components/group-monitoring/OperationsJobQueueSetupModal';
import { buildAutomationJobRunContext } from '@/lib/automationJobRunContext';
import {
  enqueueAutomationJob,
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
import { useLanguage } from '@/hooks/useLanguage';
import {
  enqueueErrorResult,
  isEnqueueErrorResult,
} from '@/lib/operationsJobQueueEnqueueResult';
import { mapEnqueueJobQueueError } from '@/lib/mapEnqueueJobQueueError';
import type { JobQueueTaskType } from '@/lib/operationsJobQueueUi';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { MissingMasterGroupForJoin } from '@/lib/loadMissingMasterGroupsForJoin';
import type { Platform } from '@/types/database';

interface OperationsJobQueueAddBarProps {
  groups: AccountBrandGroup[];
  platform: Platform;
  brandFilter: string;
  taskType: JobQueueTaskType;
  onTaskTypeChange: (taskType: JobQueueTaskType) => void;
}

function resolveBrandName(brandFilter: string, selectedBrand: string, brandOptions: string[]): string {
  if (brandFilter !== 'all') return brandFilter;
  if (selectedBrand && brandOptions.includes(selectedBrand)) return selectedBrand;
  return brandOptions[0] ?? '';
}

function returnEnqueueError(error: string, t: (key: string) => string, setFeedback: (msg: string) => void): string {
  const message = mapEnqueueJobQueueError(error, t);
  setFeedback(message);
  return enqueueErrorResult(message);
}

export function OperationsJobQueueAddBar({
  groups,
  platform,
  brandFilter,
  taskType,
  onTaskTypeChange,
}: OperationsJobQueueAddBarProps) {
  const { t } = useLanguage();

  const brandOptions = useMemo(() => {
    return [
      ...new Set(
        groups
          .filter((g) => g.accounts.some((a) => a.platform === platform))
          .map((g) => g.brandName.trim())
          .filter(Boolean),
      ),
    ].sort();
  }, [groups, platform]);

  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [superAdminAccountId, setSuperAdminAccountId] = useState('');
  const [joinableGroups, setJoinableGroups] = useState<MissingMasterGroupForJoin[]>([]);
  const [joinGroupAccountIds, setJoinGroupAccountIds] = useState<Record<string, string[]>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [loadingJoinGroups, setLoadingJoinGroups] = useState(false);
  const [superAdminGroups, setSuperAdminGroups] = useState<SuperAdminGroupForSetAdmin[]>([]);
  const [loadingSuperAdminGroups, setLoadingSuperAdminGroups] = useState(false);
  const [accountExitGroups, setAccountExitGroups] = useState<AccountExitGroupsSnapshot>({
    daily: [],
    junk: [],
  });
  const [processedExitGroupIds, setProcessedExitGroupIds] = useState<Set<string>>(() => new Set());
  const [loadingAccountDailyGroups, setLoadingAccountDailyGroups] = useState(false);

  const activeBrand = resolveBrandName(brandFilter, selectedBrand, brandOptions);

  useEffect(() => {
    if (brandFilter !== 'all') return;
    if (selectedBrand && brandOptions.includes(selectedBrand)) return;
    setSelectedBrand(brandOptions[0] ?? '');
  }, [brandFilter, brandOptions, selectedBrand]);

  const platformAccounts = useMemo(() => {
    const group = groups.find((g) => g.brandName === activeBrand);
    if (!group) return [];
    return group.accounts.filter((row) => row.platform === platform);
  }, [activeBrand, groups, platform]);

  const validAccounts = useMemo(
    () => platformAccounts.filter((row) => row.sessionStatus === 'valid'),
    [platformAccounts],
  );

  useEffect(() => {
    setSelectedAccountId('');
    setSuperAdminAccountId('');
    setJoinableGroups([]);
    setJoinGroupAccountIds({});
    setSuperAdminGroups([]);
    setAccountExitGroups({ daily: [], junk: [] });
  }, [activeBrand, platform]);

  useEffect(() => {
    if (taskType === 'set_admin') return;
    if (selectedAccountId && validAccounts.some((row) => row.id === selectedAccountId)) return;
    const first = validAccounts[0];
    setSelectedAccountId(first?.id ?? '');
  }, [taskType, selectedAccountId, validAccounts]);

  useEffect(() => {
    if (taskType !== 'set_admin') return;
    if (superAdminAccountId && validAccounts.some((row) => row.id === superAdminAccountId)) return;
    const first = validAccounts[0];
    setSuperAdminAccountId(first?.id ?? '');
  }, [taskType, superAdminAccountId, validAccounts]);

  const reloadMissingGroups = useCallback(async () => {
    const accountIds =
      selectedAccountId && validAccounts.some((row) => row.id === selectedAccountId)
        ? [selectedAccountId]
        : [];
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
      if (setupOpen) setFeedback(t('operations.jobQueue.loadMissingFailed'));
    } finally {
      setLoadingJoinGroups(false);
    }
  }, [activeBrand, platform, selectedAccountId, setupOpen, t, validAccounts]);

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
      const available = rows.filter((row) => !busyGroupIds.has(row.groupId));
      setSuperAdminGroups(available);
    } catch {
      setSuperAdminGroups([]);
      if (setupOpen) setFeedback(t('operations.jobQueue.loadMissingFailed'));
    } finally {
      setLoadingSuperAdminGroups(false);
    }
  }, [activeBrand, platform, setupOpen, superAdminAccountId, t, validAccounts]);

  const reloadAccountExitGroups = useCallback(async () => {
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

    setLoadingAccountDailyGroups(true);
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
      if (setupOpen) setFeedback(t('operations.jobQueue.loadDailyGroupsFailed'));
    } finally {
      setLoadingAccountDailyGroups(false);
    }
  }, [activeBrand, platform, selectedAccountId, setupOpen, t, taskType, validAccounts]);

  useEffect(() => {
    if (taskType !== 'join' || !setupOpen) return;
    void reloadMissingGroups();
  }, [taskType, setupOpen, reloadMissingGroups]);

  useEffect(() => {
    if (taskType !== 'set_admin' || !setupOpen) return;
    void reloadSuperAdminGroups();
  }, [taskType, setupOpen, reloadSuperAdminGroups]);

  useEffect(() => {
    if (taskType !== 'exit_delete_group' || !setupOpen) return;
    void reloadAccountExitGroups();
  }, [taskType, setupOpen, reloadAccountExitGroups]);

  useEffect(() => {
    return subscribeJobQueueChanged(() => {
      if (taskType === 'join') void reloadMissingGroups();
      if (taskType === 'set_admin') void reloadSuperAdminGroups();
      if (taskType === 'exit_delete_group') void reloadAccountExitGroups();
    });
  }, [taskType, reloadAccountExitGroups, reloadMissingGroups, reloadSuperAdminGroups]);

  const selectedAccounts = useMemo(() => {
    const account = validAccounts.find((row) => row.id === selectedAccountId);
    return account ? [account] : [];
  }, [selectedAccountId, validAccounts]);

  const superAdminAccount = validAccounts.find((row) => row.id === superAdminAccountId);

  async function saveJoinBatch(groupIds: string[]): Promise<string | null> {
    if (selectedAccounts.length === 0 || groupIds.length === 0) return null;

    const workerSettings =
      platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
    const maxPerRun = workerSettings.inviteLink.maxPerRun;

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

    setSubmitting(true);
    let queuedAccounts = 0;
    let totalGroups = 0;

    try {
      for (const account of selectedAccounts) {
        let groups = groupsByAccount.get(account.id) ?? [];
        if (groups.length === 0) continue;
        if (maxPerRun > 0) groups = groups.slice(0, maxPerRun);

        const ctx = await buildAutomationJobRunContext(account, 'join_by_invite_link');
        const result = await enqueueAutomationJob({
          brandName: activeBrand,
          platform,
          accountId: account.id,
          accountName: account.accountName,
          sessionId: ctx.sessionId,
          action: 'join_by_invite_link',
          payload: { groups },
          storedSessionString: ctx.storedSessionString,
          expectedPhone: ctx.expectedPhone,
          delay: ctx.delay,
        });
        if (!result.ok) {
          return returnEnqueueError(result.error, t, setFeedback);
        }
        queuedAccounts += 1;
        totalGroups += groups.length;
      }

      if (queuedAccounts > 0) {
        await reloadMissingGroups();
        return t('operations.jobQueue.queuedJoinAccountsOk', {
          accounts: queuedAccounts,
          groups: totalGroups,
        });
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCreateBatch(draft: JobQueueCreateGroupDraft): Promise<string | null> {
    const workerSettings =
      platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
    const createGroupSettings =
      platform === 'whatsapp'
        ? {
            messagesAdminsOnly: workerSettings.createGroup.messagesAdminsOnly,
            addMembersAdminsOnly: workerSettings.createGroup.addMembersAdminsOnly,
            infoAdminsOnly: workerSettings.createGroup.infoAdminsOnly,
          }
        : undefined;

    if (selectedAccounts.length === 0 || !activeBrand) return null;

    setSubmitting(true);
    let queued = 0;
    try {
      for (const account of selectedAccounts) {
        const ctx = await buildAutomationJobRunContext(account, 'create_group');
        const result = await enqueueAutomationJob({
          brandName: activeBrand,
          platform,
          accountId: account.id,
          accountName: account.accountName,
          sessionId: ctx.sessionId,
          action: 'create_group',
          payload: {
            groupName: draft.groupName,
            groupNamePrefix: draft.groupName,
            totalToCreate: draft.totalToCreate,
            startFrom: draft.startFrom,
            perRun: workerSettings.standard.perRun,
            initialParticipants: draft.participants.length ? draft.participants : undefined,
            hideChatHistory:
              platform === 'telegram'
                ? workerSettings.createGroup.hideChatHistoryForMembers
                : undefined,
            createGroupSettings,
          },
          storedSessionString: ctx.storedSessionString,
          expectedPhone: ctx.expectedPhone,
          delay: ctx.delay,
        });

        if (!result.ok) {
          return returnEnqueueError(result.error, t, setFeedback);
        }
        queued += 1;
      }

      if (queued > 0) {
        return t('operations.jobQueue.queuedCreateBatchOk', { total: draft.totalToCreate });
      }
      return null;
    } finally {
      setSubmitting(false);
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

    setSubmitting(true);
    try {
      const groups = draft.groupIds.map((groupId) => {
        const group = superAdminGroups.find((row) => row.groupId === groupId);
        const inviteLink = group?.inviteLink?.trim() || undefined;
        return {
          groupId,
          groupName: group?.groupName ?? groupId,
          inviteLink,
          groupLink: platform === 'telegram' ? inviteLink : undefined,
        };
      });

      const ctx = await buildAutomationJobRunContext(superAdminAccount, 'set_admin');
      const result = await enqueueAutomationJob({
        brandName: activeBrand,
        platform,
        accountId: superAdminAccount.id,
        accountName: superAdminAccount.accountName,
        sessionId: ctx.sessionId,
        action: 'set_admin',
        payload: {
          groups,
          targets,
          targetAccountNames: targetAccounts.map((row) => row.accountName),
          adminRights:
            platform === 'telegram' ? toTelegramAdminRightsPayload(workerSettings) : undefined,
        },
        storedSessionString: ctx.storedSessionString,
        expectedPhone: ctx.expectedPhone,
        delay: ctx.delay,
      });
      if (!result.ok) {
        return returnEnqueueError(result.error, t, setFeedback);
      }

      await reloadSuperAdminGroups();
      return t('operations.jobQueue.queuedSetAdminOk', { count: groups.length });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveExitBatch(groupIds: string[]): Promise<string | null> {
    if (selectedAccounts.length !== 1 || groupIds.length === 0) return null;

    const account = selectedAccounts[0];
    const workerSettings =
      platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();

    if (!workerSettings.leaveDelete.leaveEnabled) {
      setFeedback(t('operations.jobQueue.exitLeaveDisabledInSettings'));
      return enqueueErrorResult(t('operations.jobQueue.exitLeaveDisabledInSettings'));
    }

    const allExitGroups = accountExitGroups.daily;
    const allowedIds = new Set(allExitGroups.map((row) => row.groupId));
    const selectedGroups = groupIds
      .filter((groupId) => allowedIds.has(groupId))
      .map((groupId) => {
        const group = allExitGroups.find((row) => row.groupId === groupId);
        const inviteLink = group?.inviteLink?.trim() || undefined;
        return {
          groupId,
          groupName: group?.groupName ?? groupId,
          inviteLink,
          groupLink: platform === 'telegram' ? inviteLink : undefined,
        };
      });

    if (selectedGroups.length === 0) return null;

    const alreadyProcessed = groupIds.filter((groupId) => processedExitGroupIds.has(groupId));
    if (alreadyProcessed.length > 0) {
      setFeedback(t('operations.jobQueue.exitGroupAlreadyProcessed'));
      return enqueueErrorResult(t('operations.jobQueue.exitGroupAlreadyProcessed'));
    }

    setSubmitting(true);
    try {
      const ctx = await buildAutomationJobRunContext(account, 'leave_group');
      const result = await enqueueAutomationJob({
        brandName: activeBrand,
        platform,
        accountId: account.id,
        accountName: account.accountName,
        sessionId: ctx.sessionId,
        action: 'leave_group',
        payload: {
          groups: selectedGroups,
          exitDeletePhase: 'exit',
          leaveDelete: toLeaveDeleteJobPayload(workerSettings),
        },
        storedSessionString: ctx.storedSessionString,
        expectedPhone: ctx.expectedPhone,
        delay: ctx.delay,
      });
      if (!result.ok) {
        return returnEnqueueError(result.error, t, setFeedback);
      }

      await reloadAccountExitGroups();
      return t('operations.jobQueue.queuedExitOk', { count: selectedGroups.length });
    } finally {
      setSubmitting(false);
    }
  }

  function openSetupModal() {
    setFeedback(null);
    setSetupOpen(true);
  }

  function handleSetupSaved(message: string) {
    setFeedback(message);
    setSetupOpen(false);
  }

  const setAdminTargetCandidates = validAccounts.filter((row) => row.id !== superAdminAccountId);

  const workerSettings =
    platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();

  const setupReady = useMemo(() => {
    if (!activeBrand) return false;
    if (taskType === 'set_admin') {
      return Boolean(superAdminAccountId && superAdminAccount);
    }
    if (taskType === 'exit_delete_group') {
      return (
        Boolean(selectedAccountId && selectedAccounts.length > 0) &&
        workerSettings.leaveDelete.leaveEnabled
      );
    }
    return Boolean(selectedAccountId && selectedAccounts.length > 0);
  }, [
    activeBrand,
    selectedAccountId,
    selectedAccounts.length,
    superAdminAccount,
    superAdminAccountId,
    taskType,
    workerSettings,
  ]);

  const brandSelectDisabled = submitting;
  const accountSelectDisabled = submitting;
  const brandSelectOptions = useMemo(
    () => brandOptions.map((brand) => ({ value: brand, label: brand })),
    [brandOptions],
  );

  const accountSelectOptions = useMemo(
    () => platformAccounts.map((row) => ({ value: row.id, label: row.accountName })),
    [platformAccounts],
  );

  const invalidAccountIds = useMemo(
    () => platformAccounts.filter((row) => row.sessionStatus !== 'valid').map((row) => row.id),
    [platformAccounts],
  );

  const superAdminSelectOptions = useMemo(
    () => validAccounts.map((row) => ({ value: row.id, label: row.accountName })),
    [validAccounts],
  );

  const setupDisabled = !setupReady || submitting;

  const actionTabs = [
    ['join', 'operations.jobQueue.tabJoin'],
    ['create_group', 'operations.jobQueue.tabCreateGroup'],
    ['set_admin', 'operations.jobQueue.tabSetAdmin'],
    ['exit_delete_group', 'operations.jobQueue.tabExitDelete'],
  ] as const;

  const taskTypeSelectOptions = useMemo(
    () => actionTabs.map(([value, labelKey]) => ({ value, label: t(labelKey) })),
    [t],
  );

  if (brandOptions.length === 0) {
    return null;
  }

  return (
    <section className="operations-job-queue-add">
      <div className="operations-job-queue-execute-panel">
        <div className="operations-job-queue-add-filters">
          <label className="operations-job-queue-field operations-job-queue-field--inline">
            <span>{t('operations.jobQueue.actionTabsLabel')}</span>
            <DarkSelect
              value={taskType}
              onChange={(value) => {
                onTaskTypeChange(value as JobQueueTaskType);
                setFeedback(null);
              }}
              options={taskTypeSelectOptions}
              ariaLabel={t('operations.jobQueue.actionTabsLabel')}
              triggerClassName="account-slicer-select operations-job-queue-select"
              disabled={brandSelectDisabled}
            />
          </label>

        {brandFilter === 'all' ? (
          <label className="operations-job-queue-field operations-job-queue-field--inline">
            <span>{t('operations.jobQueue.colBrand')}</span>
            <DarkSelect
              value={activeBrand}
              onChange={setSelectedBrand}
              options={brandSelectOptions}
              ariaLabel={t('operations.jobQueue.colBrand')}
              triggerClassName="account-slicer-select operations-job-queue-select"
              disabled={brandSelectDisabled || brandSelectOptions.length === 0}
            />
          </label>
        ) : (
          <div className="operations-job-queue-field operations-job-queue-field--inline operations-job-queue-field--readonly">
            <span>{t('operations.jobQueue.colBrand')}</span>
            <strong>{brandFilter}</strong>
          </div>
        )}

        {taskType === 'set_admin' ? (
          <label className="operations-job-queue-field operations-job-queue-field--inline">
            <span>{t('operations.jobQueue.setAdminSuperAccount')}</span>
            <DarkSelect
              value={superAdminAccountId}
              onChange={setSuperAdminAccountId}
              options={superAdminSelectOptions}
              ariaLabel={t('operations.jobQueue.setAdminSuperAccount')}
              triggerClassName="account-slicer-select operations-job-queue-select"
              disabled={accountSelectDisabled || superAdminSelectOptions.length === 0}
            />
          </label>
        ) : (
          <div className="operations-job-queue-field operations-job-queue-field--inline">
            <span>{t('operations.jobQueue.account')}</span>
            {platformAccounts.length === 0 ? (
              <span className="operations-schedule-join-empty">{t('operations.jobQueue.noAccounts')}</span>
            ) : (
              <DarkSelect
                value={selectedAccountId}
                onChange={setSelectedAccountId}
                options={accountSelectOptions}
                disabledValues={invalidAccountIds}
                ariaLabel={t('operations.jobQueue.account')}
                triggerClassName="account-slicer-select operations-job-queue-select"
                disabled={accountSelectDisabled}
                placeholder={t('operations.jobQueue.pickAccount')}
              />
            )}
          </div>
        )}

        <div className="operations-job-queue-add-filters__actions">
          <button
            type="button"
            className="operations-job-queue-setup-btn"
            disabled={setupDisabled}
            onClick={openSetupModal}
            aria-label={t('operations.jobQueue.setup')}
            title={t('operations.jobQueue.setup')}
          >
            <Settings className="operations-job-queue-setup-btn__icon" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {feedback ? <p className="operations-schedule-join-feedback">{feedback}</p> : null}
      </div>

      <OperationsJobQueueSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        taskType={taskType}
        platform={platform}
        activeBrand={activeBrand}
        selectedAccounts={selectedAccounts}
        superAdminAccount={superAdminAccount}
        targetAccountCandidates={setAdminTargetCandidates}
        joinableGroups={joinableGroups}
        joinGroupAccountIds={joinGroupAccountIds}
        loadingJoinGroups={loadingJoinGroups}
        superAdminGroups={superAdminGroups}
        loadingSuperAdminGroups={loadingSuperAdminGroups}
        accountExitGroups={accountExitGroups}
        processedExitGroupIds={processedExitGroupIds}
        loadingAccountDailyGroups={loadingAccountDailyGroups}
        saving={submitting}
        onSaveJoin={async (groupIds) => {
          const message = await saveJoinBatch(groupIds);
          if (message && !isEnqueueErrorResult(message)) handleSetupSaved(message);
          return message;
        }}
        onSaveCreate={async (draft) => {
          const message = await saveCreateBatch(draft);
          if (message && !isEnqueueErrorResult(message)) handleSetupSaved(message);
          return message;
        }}
        onSaveSetAdmin={async (draft) => {
          const message = await saveSetAdminBatch(draft);
          if (message && !isEnqueueErrorResult(message)) handleSetupSaved(message);
          return message;
        }}
        onSaveExitDelete={async (groupIds) => {
          const message = await saveExitBatch(groupIds);
          if (message && !isEnqueueErrorResult(message)) handleSetupSaved(message);
          return message;
        }}
      />
    </section>
  );
}
