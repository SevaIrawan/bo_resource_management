import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { cn } from '@/lib/utils';
import {
  readTelegramWorkerSettings,
  readWhatsAppWorkerSettings,
} from '@/config/workerPlatformSettings';
import { useLanguage } from '@/hooks/useLanguage';
import {
  isEnqueueErrorResult,
  parseEnqueueErrorResult,
} from '@/lib/operationsJobQueueEnqueueResult';
import type { JobQueueTaskType } from '@/lib/operationsJobQueueUi';
import type { MissingMasterGroupForJoin } from '@/lib/loadMissingMasterGroupsForJoin';
import type { AccountDailyGroupForLeaveDelete, AccountExitGroupsSnapshot } from '@/lib/loadAccountDailyGroupsForLeaveDelete';
import {
  filterSetAdminGroupsForTargets,
  type SuperAdminGroupForSetAdmin,
} from '@/lib/loadSuperAdminGroupsForSetAdmin';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

const EXIT_GROUP_SETUP_PAGE_SIZE = 10;

export interface JobQueueCreateGroupDraft {
  groupName: string;
  totalToCreate: number;
  startFrom: number;
  participants: string[];
}

export interface JobQueueSetAdminDraft {
  groupIds: string[];
  targetAccountIds: string[];
}

interface OperationsJobQueueSetupModalProps {
  open: boolean;
  onClose: () => void;
  taskType: JobQueueTaskType;
  platform: Platform;
  activeBrand: string;
  selectedAccounts: AccountBrandRow[];
  superAdminAccount: AccountBrandRow | undefined;
  targetAccountCandidates: AccountBrandRow[];
  joinableGroups: MissingMasterGroupForJoin[];
  joinGroupAccountIds: Record<string, string[]>;
  loadingJoinGroups: boolean;
  superAdminGroups: SuperAdminGroupForSetAdmin[];
  loadingSuperAdminGroups: boolean;
  accountExitGroups: AccountExitGroupsSnapshot;
  processedExitGroupIds?: ReadonlySet<string>;
  loadingAccountDailyGroups: boolean;
  saving: boolean;
  onSaveJoin: (groupIds: string[]) => Promise<string | null>;
  onSaveCreate: (draft: JobQueueCreateGroupDraft) => Promise<string | null>;
  onSaveSetAdmin: (draft: JobQueueSetAdminDraft) => Promise<string | null>;
  onSaveExitDelete: (groupIds: string[]) => Promise<string | null>;
}

function parseMultiValueInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function OperationsJobQueueSetupModal({
  open,
  onClose,
  taskType,
  platform,
  activeBrand,
  selectedAccounts,
  superAdminAccount,
  targetAccountCandidates,
  joinableGroups,
  joinGroupAccountIds,
  loadingJoinGroups,
  superAdminGroups,
  loadingSuperAdminGroups,
  accountExitGroups,
  processedExitGroupIds,
  loadingAccountDailyGroups,
  saving,
  onSaveJoin,
  onSaveCreate,
  onSaveSetAdmin,
  onSaveExitDelete,
}: OperationsJobQueueSetupModalProps) {
  const { t } = useLanguage();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedJoinGroupIds, setSelectedJoinGroupIds] = useState<Set<string>>(() => new Set());
  const [createGroupName, setCreateGroupName] = useState('');
  const [createParticipants, setCreateParticipants] = useState('');
  const [createTotalToCreate, setCreateTotalToCreate] = useState('10');
  const [createStartFrom, setCreateStartFrom] = useState('1');
  const [selectedSetAdminGroupIds, setSelectedSetAdminGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [exitGroupTab, setExitGroupTab] = useState<'daily' | 'junk'>('daily');
  const [exitGroupPage, setExitGroupPage] = useState(1);
  const [exitGroupProcessedAlertOpen, setExitGroupProcessedAlertOpen] = useState(false);
  const [selectedLeaveDeleteGroupIds, setSelectedLeaveDeleteGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedSetAdminTargetAccountId, setSelectedSetAdminTargetAccountId] = useState('');
  const [eligibleSetAdminGroups, setEligibleSetAdminGroups] = useState<SuperAdminGroupForSetAdmin[]>(
    [],
  );
  const [filteringSetAdminGroups, setFilteringSetAdminGroups] = useState(false);

  const workerSettings =
    platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
  const createTotalParsed = Math.max(1, Math.min(500, Math.floor(Number(createTotalToCreate)) || 1));

  const setAdminTargetOptions = useMemo(
    () => targetAccountCandidates.map((row) => ({ value: row.id, label: row.accountName })),
    [targetAccountCandidates],
  );

  const setAdminTargetDisabledIds = useMemo(
    () =>
      targetAccountCandidates
        .filter((row) => row.sessionStatus !== 'valid' || !row.phoneNumber?.trim())
        .map((row) => row.id),
    [targetAccountCandidates],
  );

  const visibleJoinGroups = useMemo(() => {
    const accountIds = new Set(selectedAccounts.map((row) => row.id));
    if (accountIds.size === 0) return [];
    return joinableGroups.filter((group) => {
      const eligible = joinGroupAccountIds[group.groupId] ?? [];
      return eligible.some((id) => accountIds.has(id));
    });
  }, [joinGroupAccountIds, joinableGroups, selectedAccounts]);

  const allJoinGroupsSelected =
    visibleJoinGroups.length > 0 &&
    visibleJoinGroups.every((group) => selectedJoinGroupIds.has(group.groupId));

  const allSetAdminGroupsSelected =
    eligibleSetAdminGroups.length > 0 &&
    eligibleSetAdminGroups.every((group) => selectedSetAdminGroupIds.has(group.groupId));

  const visibleExitGroups = useMemo((): AccountDailyGroupForLeaveDelete[] => {
    return exitGroupTab === 'daily' ? accountExitGroups.daily : accountExitGroups.junk;
  }, [accountExitGroups.daily, accountExitGroups.junk, exitGroupTab]);

  const exitGroupPageCount = Math.max(
    1,
    Math.ceil(visibleExitGroups.length / EXIT_GROUP_SETUP_PAGE_SIZE),
  );
  const exitGroupPageSafe = Math.min(exitGroupPage, exitGroupPageCount);
  const exitGroupPageOffset = (exitGroupPageSafe - 1) * EXIT_GROUP_SETUP_PAGE_SIZE;
  const pagedExitGroups = visibleExitGroups.slice(
    exitGroupPageOffset,
    exitGroupPageOffset + EXIT_GROUP_SETUP_PAGE_SIZE,
  );
  const showExitGroupPagination = visibleExitGroups.length > EXIT_GROUP_SETUP_PAGE_SIZE;
  const exitGroupPageFrom = visibleExitGroups.length === 0 ? 0 : exitGroupPageOffset + 1;
  const exitGroupPageTo = Math.min(
    exitGroupPageOffset + EXIT_GROUP_SETUP_PAGE_SIZE,
    visibleExitGroups.length,
  );

  const selectablePagedExitGroups = useMemo(
    () => pagedExitGroups.filter((group) => !processedExitGroupIds?.has(group.groupId)),
    [pagedExitGroups, processedExitGroupIds],
  );

  const allLeaveDeleteGroupsOnPageSelected =
    selectablePagedExitGroups.length > 0 &&
    selectablePagedExitGroups.every((group) => selectedLeaveDeleteGroupIds.has(group.groupId));

  const loadingSetAdminGroupList = loadingSuperAdminGroups || filteringSetAdminGroups;

  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    setSelectedJoinGroupIds(new Set());
    setCreateGroupName('');
    setCreateParticipants('');
    setCreateTotalToCreate('10');
    setCreateStartFrom('1');
    setSelectedSetAdminGroupIds(new Set());
    setSelectedLeaveDeleteGroupIds(new Set());
    setExitGroupTab('daily');
    setExitGroupPage(1);
    setExitGroupProcessedAlertOpen(false);
    setSelectedSetAdminTargetAccountId('');
    setEligibleSetAdminGroups([]);
  }, [open, taskType, activeBrand]);

  useEffect(() => {
    setExitGroupPage(1);
  }, [exitGroupTab]);

  useEffect(() => {
    if (exitGroupPage > exitGroupPageCount) {
      setExitGroupPage(exitGroupPageCount);
    }
  }, [exitGroupPage, exitGroupPageCount]);

  useEffect(() => {
    if (!open || taskType !== 'set_admin') return;

    if (!selectedSetAdminTargetAccountId) {
      setEligibleSetAdminGroups([]);
      setFilteringSetAdminGroups(false);
      return;
    }

    let cancelled = false;
    setFilteringSetAdminGroups(true);

    void filterSetAdminGroupsForTargets({
      ownerGroups: superAdminGroups,
      targetAccountIds: [selectedSetAdminTargetAccountId],
      brandName: activeBrand,
      platform,
    })
      .then((rows) => {
        if (cancelled) return;
        setEligibleSetAdminGroups(rows);
        setSelectedSetAdminGroupIds((prev) => {
          const allowed = new Set(rows.map((row) => row.groupId));
          const next = new Set([...prev].filter((id) => allowed.has(id)));
          return next.size === prev.size ? prev : next;
        });
      })
      .finally(() => {
        if (!cancelled) setFilteringSetAdminGroups(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeBrand,
    open,
    platform,
    selectedSetAdminTargetAccountId,
    superAdminGroups,
    taskType,
  ]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, saving]);

  if (!open) return null;

  function toggleJoinGroup(groupId: string) {
    setSelectedJoinGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function toggleAllJoinGroups() {
    if (allJoinGroupsSelected) {
      setSelectedJoinGroupIds(new Set());
      return;
    }
    setSelectedJoinGroupIds(new Set(visibleJoinGroups.map((group) => group.groupId)));
  }

  function toggleSetAdminGroup(groupId: string) {
    setSelectedSetAdminGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function toggleAllSetAdminGroups() {
    if (allSetAdminGroupsSelected) {
      setSelectedSetAdminGroupIds(new Set());
      return;
    }
    setSelectedSetAdminGroupIds(new Set(eligibleSetAdminGroups.map((group) => group.groupId)));
  }

  function isExitGroupAlreadyProcessed(groupId: string): boolean {
    return processedExitGroupIds?.has(groupId) ?? false;
  }

  function toggleLeaveDeleteGroup(groupId: string) {
    if (isExitGroupAlreadyProcessed(groupId)) {
      setExitGroupProcessedAlertOpen(true);
      return;
    }
    setSelectedLeaveDeleteGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function toggleAllLeaveDeleteGroups() {
    if (allLeaveDeleteGroupsOnPageSelected) {
    setSelectedLeaveDeleteGroupIds((prev) => {
      const next = new Set(prev);
      for (const group of pagedExitGroups) next.delete(group.groupId);
      return next;
    });
    return;
  }
  if (selectablePagedExitGroups.length === 0) {
    setExitGroupProcessedAlertOpen(true);
    return;
  }
  setSelectedLeaveDeleteGroupIds((prev) => {
      const next = new Set(prev);
      for (const group of pagedExitGroups) {
        if (isExitGroupAlreadyProcessed(group.groupId)) continue;
        next.add(group.groupId);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaveError(null);
    let message: string | null = null;

    if (taskType === 'join') {
      if (selectedJoinGroupIds.size === 0) {
        setSaveError(t('operations.jobQueue.selectMissingGroup'));
        return;
      }
      message = await onSaveJoin([...selectedJoinGroupIds]);
    } else if (taskType === 'create_group') {
      if (!createGroupName.trim()) {
        setSaveError(t('operations.jobQueue.createGroupNameRequired'));
        return;
      }
      message = await onSaveCreate({
        groupName: createGroupName.trim(),
        totalToCreate: createTotalParsed,
        startFrom: Math.max(1, Math.floor(Number(createStartFrom)) || 1),
        participants: parseMultiValueInput(createParticipants),
      });
    } else if (taskType === 'set_admin') {
      if (selectedSetAdminGroupIds.size === 0) {
        setSaveError(t('operations.jobQueue.setAdminSelectGroup'));
        return;
      }
      if (!selectedSetAdminTargetAccountId) {
        setSaveError(t('operations.jobQueue.setAdminSelectTargetAccount'));
        return;
      }
      message = await onSaveSetAdmin({
        groupIds: [...selectedSetAdminGroupIds],
        targetAccountIds: [selectedSetAdminTargetAccountId],
      });
    } else if (taskType === 'exit_delete_group') {
      if (selectedLeaveDeleteGroupIds.size === 0) {
        setSaveError(t('operations.jobQueue.exitDeleteSelectGroup'));
        return;
      }
      message = await onSaveExitDelete([...selectedLeaveDeleteGroupIds]);
    } else {
      setSaveError(t('operations.jobQueue.enqueueFailed'));
      return;
    }

    if (!message) {
      setSaveError(t('operations.jobQueue.enqueueFailed'));
      return;
    }
    if (isEnqueueErrorResult(message)) {
      setSaveError(parseEnqueueErrorResult(message));
      return;
    }
    onClose();
  }

  const modalTitle =
    taskType === 'join'
      ? t('operations.jobQueue.setupModalTitleJoin')
      : taskType === 'create_group'
        ? t('operations.jobQueue.setupModalTitleCreate')
        : taskType === 'set_admin'
          ? t('operations.jobQueue.setupModalTitleSetAdmin')
          : t('operations.jobQueue.setupModalTitleExitDelete');

  const tabLabelKey =
    taskType === 'join'
      ? 'operations.jobQueue.tabJoin'
      : taskType === 'create_group'
        ? 'operations.jobQueue.tabCreateGroup'
        : taskType === 'set_admin'
          ? 'operations.jobQueue.tabSetAdmin'
          : 'operations.jobQueue.tabExitDelete';

  const canSaveJoin = selectedJoinGroupIds.size > 0 && selectedAccounts.length > 0;
  const canSaveCreate = createGroupName.trim().length > 0 && selectedAccounts.length > 0;
  const canSaveSetAdmin =
    Boolean(superAdminAccount) &&
    selectedSetAdminGroupIds.size > 0 &&
    selectedSetAdminTargetAccountId;
  const canSaveExitDelete =
    selectedLeaveDeleteGroupIds.size > 0 && selectedAccounts.length > 0;

  const saveDisabled =
    saving ||
    (taskType === 'join' && !canSaveJoin) ||
    (taskType === 'create_group' && !canSaveCreate) ||
    (taskType === 'set_admin' && !canSaveSetAdmin) ||
    (taskType === 'exit_delete_group' && !canSaveExitDelete);

  const setupModeClass =
    taskType === 'join'
      ? 'brand-modal-panel--job-queue-setup-join'
      : taskType === 'create_group'
        ? 'brand-modal-panel--job-queue-setup-create'
        : taskType === 'set_admin'
          ? 'brand-modal-panel--job-queue-setup-set-admin'
          : 'brand-modal-panel--job-queue-setup-exit-delete';

  return (
    <>
    <BrandModalRoot onBackdropClick={saving ? undefined : onClose}>
      <div
        className={`brand-modal-panel brand-modal-panel--job-queue-setup ${setupModeClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-queue-setup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header brand-modal-header--job-queue-setup">
          <div className="brand-modal-header-main">
            <h2 id="job-queue-setup-title" className="brand-modal-title">
              {modalTitle}
            </h2>
            <p className="brand-modal-subtitle">
              {activeBrand} · {t(tabLabelKey)}
            </p>
          </div>
          <div className="brand-modal-header-actions">
            {taskType === 'exit_delete_group' ? (
              <div
                className="operations-job-queue-exit-group-tabs operations-job-queue-exit-group-tabs--header"
                role="tablist"
                aria-label={t('operations.jobQueue.exitGroupTabList')}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={exitGroupTab === 'daily'}
                  className={cn(
                    'operations-job-queue-exit-group-tab',
                    exitGroupTab === 'daily' && 'operations-job-queue-exit-group-tab--active',
                  )}
                  onClick={() => setExitGroupTab('daily')}
                  disabled={saving}
                >
                  {t('operations.jobQueue.exitTabDaily')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={exitGroupTab === 'junk'}
                  className={cn(
                    'operations-job-queue-exit-group-tab',
                    exitGroupTab === 'junk' && 'operations-job-queue-exit-group-tab--active',
                  )}
                  onClick={() => setExitGroupTab('junk')}
                  disabled={saving}
                >
                  {t('operations.jobQueue.exitTabJunk')}
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="brand-modal-close"
              onClick={onClose}
              disabled={saving}
              aria-label={t('groupMonitoring.accountCard.closeModal')}
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="brand-modal-form operations-job-queue-setup-modal-body">
          {taskType === 'join' ? (
            <div className="operations-job-queue-setup-form operations-job-queue-setup-form--join">
              <p className="operations-job-queue-form-note">{t('operations.jobQueue.modalHint')}</p>
              <div className="operations-job-queue-table-wrap operations-job-queue-table-wrap--scroll-body">
                <table className="operations-job-queue-table operations-job-queue-table--missing">
                  <thead>
                    <tr>
                      <th className="operations-job-queue-select-col">
                        <label className="operations-job-queue-select-all">
                          <input
                            type="checkbox"
                            checked={allJoinGroupsSelected}
                            onChange={toggleAllJoinGroups}
                            disabled={loadingJoinGroups || visibleJoinGroups.length === 0 || saving}
                          />
                          <span>{t('operations.jobQueue.selectAll')}</span>
                        </label>
                      </th>
                      <th>{t('operations.jobQueue.colGroup')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingJoinGroups ? (
                      <tr>
                        <td colSpan={2} className="operations-job-queue-empty">
                          <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden />{' '}
                          {t('operations.jobQueue.loadingMissing')}
                        </td>
                      </tr>
                    ) : visibleJoinGroups.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="operations-job-queue-empty">
                          {t('operations.jobQueue.noMissingGroups')}
                        </td>
                      </tr>
                    ) : (
                      visibleJoinGroups.map((group) => (
                        <tr key={group.groupId}>
                          <td className="operations-job-queue-select-col">
                            <input
                              type="checkbox"
                              className="operations-job-queue-row-checkbox"
                              checked={selectedJoinGroupIds.has(group.groupId)}
                              onChange={() => toggleJoinGroup(group.groupId)}
                              disabled={saving}
                            />
                          </td>
                          <td>{group.groupName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {taskType === 'create_group' ? (
            <div className="operations-job-queue-setup-form operations-job-queue-setup-form--create">
              <label className="operations-job-queue-field operations-job-queue-setup-form__full">
                <span>{t('operations.jobQueue.createGroupName')}</span>
                <input
                  type="text"
                  value={createGroupName}
                  onChange={(event) => setCreateGroupName(event.target.value)}
                  placeholder={t('operations.jobQueue.createGroupNamePlaceholder')}
                  disabled={saving}
                />
              </label>
              <label className="operations-job-queue-field">
                <span>{t('operations.jobQueue.createTotalToCreate')}</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={createTotalToCreate}
                  onChange={(event) => setCreateTotalToCreate(event.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="operations-job-queue-field">
                <span>{t('operations.jobQueue.createStartFrom')}</span>
                <input
                  type="number"
                  min={1}
                  value={createStartFrom}
                  onChange={(event) => setCreateStartFrom(event.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="operations-job-queue-field operations-job-queue-setup-form__full">
                <span>{t('operations.jobQueue.createGroupParticipants')}</span>
                <textarea
                  rows={2}
                  value={createParticipants}
                  onChange={(event) => setCreateParticipants(event.target.value)}
                  placeholder={t('operations.jobQueue.createGroupParticipantsPlaceholder')}
                  disabled={saving}
                />
              </label>
              <p className="operations-job-queue-form-note operations-job-queue-setup-form__full">
                {t('operations.jobQueue.createPerRunHint', {
                  perRun: workerSettings.standard.perRun,
                  total: createTotalParsed,
                })}
              </p>
            </div>
          ) : null}

          {taskType === 'set_admin' ? (
            <div className="operations-job-queue-setup-form operations-job-queue-setup-form--set-admin">
              <p className="operations-job-queue-form-note">
                {superAdminAccount
                  ? t('operations.jobQueue.setAdminSuperAccountHintNamed', {
                      account: superAdminAccount.accountName,
                    })
                  : t('operations.jobQueue.setAdminSuperAccountHint')}
              </p>
              <p className="operations-job-queue-form-note">
                {t('operations.jobQueue.setAdminTargetAccountsHint')}
              </p>
              <div className="operations-job-queue-field">
                <span>{t('operations.jobQueue.setAdminTargetAccounts')}</span>
                {setAdminTargetOptions.length === 0 ? (
                  <span className="operations-schedule-join-empty">{t('operations.jobQueue.noAccounts')}</span>
                ) : (
                  <DarkSelect
                    value={selectedSetAdminTargetAccountId}
                    onChange={(value) => {
                      setSelectedSetAdminTargetAccountId(value);
                      setSelectedSetAdminGroupIds(new Set());
                    }}
                    options={setAdminTargetOptions}
                    disabledValues={setAdminTargetDisabledIds}
                    ariaLabel={t('operations.jobQueue.setAdminTargetAccounts')}
                    triggerClassName="account-slicer-select operations-job-queue-select"
                    disabled={saving}
                    placeholder={t('operations.jobQueue.selectAccount')}
                  />
                )}
              </div>
              <div className="operations-job-queue-table-wrap operations-job-queue-table-wrap--scroll-body">
                <table className="operations-job-queue-table operations-job-queue-table--missing">
                  <thead>
                    <tr>
                      <th className="operations-job-queue-select-col">
                        <label className="operations-job-queue-select-all">
                          <input
                            type="checkbox"
                            checked={allSetAdminGroupsSelected}
                            onChange={toggleAllSetAdminGroups}
                            disabled={
                              loadingSetAdminGroupList ||
                              eligibleSetAdminGroups.length === 0 ||
                              saving ||
                              selectedSetAdminTargetAccountId === ''
                            }
                          />
                          <span>{t('operations.jobQueue.selectAll')}</span>
                        </label>
                      </th>
                      <th>{t('operations.jobQueue.colGroup')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingSetAdminGroupList ? (
                      <tr>
                        <td colSpan={2} className="operations-job-queue-empty">
                          <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden />{' '}
                          {t('operations.jobQueue.loadingMissing')}
                        </td>
                      </tr>
                    ) : !selectedSetAdminTargetAccountId ? (
                      <tr>
                        <td colSpan={2} className="operations-job-queue-empty">
                          {t('operations.jobQueue.setAdminSelectTargetFirst')}
                        </td>
                      </tr>
                    ) : eligibleSetAdminGroups.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="operations-job-queue-empty">
                          {t('operations.jobQueue.setAdminAllTargetsAlreadyAdmin')}
                        </td>
                      </tr>
                    ) : (
                      eligibleSetAdminGroups.map((group) => (
                        <tr key={group.groupId}>
                          <td className="operations-job-queue-select-col">
                            <input
                              type="checkbox"
                              className="operations-job-queue-row-checkbox"
                              checked={selectedSetAdminGroupIds.has(group.groupId)}
                              onChange={() => toggleSetAdminGroup(group.groupId)}
                              disabled={saving}
                            />
                          </td>
                          <td>{group.groupName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {taskType === 'exit_delete_group' ? (
            <div className="operations-job-queue-setup-form operations-job-queue-setup-form--exit-delete">
              <p className="operations-job-queue-exit-group-tab-caption">
                {exitGroupTab === 'daily'
                  ? t('operations.jobQueue.exitTabDailyCaption')
                  : t('operations.jobQueue.exitTabJunkCaption')}
              </p>
              <div className="operations-job-queue-table-wrap operations-job-queue-table-wrap--paged">
                <table className="operations-job-queue-table operations-job-queue-table--missing operations-job-queue-table--exit-groups">
                  <colgroup>
                    <col className="operations-job-queue-col-select" />
                    <col className="operations-job-queue-col-group" />
                    <col className="operations-job-queue-col-group-id" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="operations-job-queue-select-col">
                        <label className="operations-job-queue-select-all">
                          <input
                            type="checkbox"
                            checked={allLeaveDeleteGroupsOnPageSelected}
                            onChange={toggleAllLeaveDeleteGroups}
                            disabled={
                              loadingAccountDailyGroups ||
                              pagedExitGroups.length === 0 ||
                              saving
                            }
                          />
                          <span>{t('operations.jobQueue.selectAll')}</span>
                        </label>
                      </th>
                      <th className="operations-job-queue-col-group">{t('operations.jobQueue.colGroup')}</th>
                      <th className="operations-job-queue-col-group-id">
                        {t('operations.jobQueue.viewColGroupId')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingAccountDailyGroups ? (
                      <tr>
                        <td colSpan={3} className="operations-job-queue-empty">
                          <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden />{' '}
                          {t('operations.jobQueue.loadingDailyGroups')}
                        </td>
                      </tr>
                    ) : visibleExitGroups.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="operations-job-queue-empty">
                          {exitGroupTab === 'daily'
                            ? t('operations.jobQueue.noExitDailyGroups')
                            : t('operations.jobQueue.noExitJunkGroups')}
                        </td>
                      </tr>
                    ) : (
                      pagedExitGroups.map((group) => (
                        <tr
                          key={group.groupId}
                          className={cn(
                            isExitGroupAlreadyProcessed(group.groupId) &&
                              'operations-job-queue-exit-row--processed',
                          )}
                        >
                          <td className="operations-job-queue-select-col">
                            <input
                              type="checkbox"
                              className="operations-job-queue-row-checkbox"
                              checked={selectedLeaveDeleteGroupIds.has(group.groupId)}
                              onChange={() => toggleLeaveDeleteGroup(group.groupId)}
                              disabled={saving}
                            />
                          </td>
                          <td className="operations-job-queue-col-group" title={group.groupName}>
                            {group.groupName}
                          </td>
                          <td
                            className="operations-job-queue-col-group-id operations-job-queue-mono"
                            title={group.groupId}
                          >
                            {group.groupId}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {saveError ? <p className="brand-modal-error">{saveError}</p> : null}
        </div>

        <footer
          className={cn(
            'operations-job-queue-setup-footer',
            !(taskType === 'exit_delete_group' && showExitGroupPagination) &&
              'operations-job-queue-setup-footer--actions-only',
          )}
        >
          {taskType === 'exit_delete_group' && showExitGroupPagination ? (
            <div className="operations-job-queue-setup-footer__pagination">
              <nav
                className="group-links-pagination operations-job-queue-setup-pagination"
                aria-label={t('groupMonitoring.groupLinks.pageLabel', {
                  page: exitGroupPageSafe,
                  pages: exitGroupPageCount,
                })}
              >
                <span className="group-links-pagination-range">
                  {t('groupMonitoring.groupLinks.pageRange', {
                    from: exitGroupPageFrom,
                    to: exitGroupPageTo,
                    total: visibleExitGroups.length,
                  })}
                </span>
                <div className="group-links-pagination-actions">
                  <button
                    type="button"
                    className="group-links-page-btn"
                    disabled={exitGroupPageSafe <= 1 || saving}
                    onClick={() => setExitGroupPage((page) => Math.max(1, page - 1))}
                    aria-label={t('groupMonitoring.groupLinks.prevPage')}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                    {t('groupMonitoring.groupLinks.prevPage')}
                  </button>
                  <button
                    type="button"
                    className="group-links-page-btn"
                    disabled={exitGroupPageSafe >= exitGroupPageCount || saving}
                    onClick={() =>
                      setExitGroupPage((page) => Math.min(exitGroupPageCount, page + 1))
                    }
                    aria-label={t('groupMonitoring.groupLinks.nextPage')}
                  >
                    {t('groupMonitoring.groupLinks.nextPage')}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </nav>
            </div>
          ) : null}
          <div className="brand-modal-actions operations-job-queue-setup-footer__actions">
          <button
            type="button"
            className="brand-modal-btn brand-modal-btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            {t('groupMonitoring.accountCard.cancel')}
          </button>
          <button
            type="button"
            className="brand-modal-btn brand-modal-btn--primary"
            disabled={saveDisabled}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t('operations.jobQueue.setupSave')
            )}
          </button>
          </div>
        </footer>
      </div>
    </BrandModalRoot>

    {exitGroupProcessedAlertOpen ? (
      <BrandModalRoot onBackdropClick={() => setExitGroupProcessedAlertOpen(false)}>
        <div
          className="brand-modal-panel brand-modal-panel--sync"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="exit-group-processed-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="brand-modal-header">
            <h2 id="exit-group-processed-title" className="brand-modal-title">
              {t('operations.jobQueue.exitGroupAlreadyProcessedTitle')}
            </h2>
            <button
              type="button"
              className="brand-modal-close"
              onClick={() => setExitGroupProcessedAlertOpen(false)}
              aria-label={t('groupMonitoring.accountCard.closeModal')}
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </header>
          <div className="brand-modal-form">
            <p className="sync-modal-message">{t('operations.jobQueue.exitGroupAlreadyProcessed')}</p>
            <div className="brand-modal-actions">
              <button
                type="button"
                className="brand-modal-btn brand-modal-btn--primary"
                onClick={() => setExitGroupProcessedAlertOpen(false)}
              >
                {t('operations.jobQueue.exitGroupAlreadyProcessedOk')}
              </button>
            </div>
          </div>
        </div>
      </BrandModalRoot>
    ) : null}
    </>
  );
}
