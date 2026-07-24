import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileUp, ImagePlus, Loader2, X } from 'lucide-react';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { cn } from '@/lib/utils';
import {
  readCreateGroupWorkerSettings,
} from '@/lib/createGroupWorkerSettings';
import { collectCreateGroupSetupValidationCodes } from '@/lib/createGroupSetupValidation';
import { CREATE_GROUP_MAX_PER_ACCOUNT_RUN } from '@/config/accountOpsRole';
import {
  readTelegramWorkerSettings,
  readWhatsAppWorkerSettings,
} from '@/config/workerPlatformSettings';
import {
  brandGroupPhotoPreviewUrl,
  ensureLocalBrandGroupPhoto,
  pickAndSaveBrandGroupPhoto,
  resolveBrandGroupPhotoPath,
} from '@/lib/brandGroupPhotoClient';
import { buildCreateGroupAccountSelectModel } from '@/lib/createGroupAccountEligibility';
import { fetchJobQueueSnapshot } from '@/lib/automationJobQueueClient';
import { parseJoinImportFile } from '@/lib/parseCsvJoinImport';
import {
  validateCsvJoinAgainstMaster,
  type ValidatedCsvJoinRow,
} from '@/lib/validateCsvJoinAgainstMaster';
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
import type { AutomationJobRecord } from '@/types/automationJob';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';
import { reportingAccountDisplayName } from '@/lib/reportingDisplayName';

const EXIT_GROUP_SETUP_PAGE_SIZE = 10;

export interface JobQueueCreateGroupDraft {
  groupName: string;
  totalToCreate: number;
  useGroupNumbering: boolean;
  startFrom: number;
  createGroupSettings?: {
    messagesAdminsOnly: boolean;
    addMembersAdminsOnly: boolean;
    infoAdminsOnly: boolean;
  };
  hideChatHistoryForMembers?: boolean;
  photoPath?: string;
}

export interface JobQueueSetAdminDraft {
  groupIds: string[];
  targetAccountIds: string[];
}

interface OperationsJobQueueSetupModalProps {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
  onSaved?: (message: string) => void;
  taskType: JobQueueTaskType;
  platform: Platform;
  activeBrand: string;
  selectedAccounts: AccountBrandRow[];
  superAdminAccount: AccountBrandRow | undefined;
  targetAccountCandidates: AccountBrandRow[];
  /** Bila diisi — tampilkan pilih OWNER/ADMIN di modal (Account CTA Set admin). */
  ownerAccountCandidates?: AccountBrandRow[];
  selectedOwnerAccountId?: string;
  onOwnerAccountChange?: (accountId: string) => void;
  /** Bila diisi — tampilkan pilih Master di modal (Account CTA To prep Create). */
  createAccountCandidates?: AccountBrandRow[];
  selectedCreateAccountId?: string;
  onCreateAccountChange?: (accountId: string) => void;
  preferredCreateTotal?: number;
  preferredSetAdminTargetId?: string;
  preferredExitGroupTab?: 'daily' | 'junk';
  preferredMasterListExpanded?: boolean;
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
  onSaveJoinCsv: (groups: Array<{ groupId: string; groupName: string; inviteLink: string }>) => Promise<string | null>;
  onSaveCreate: (draft: JobQueueCreateGroupDraft) => Promise<string | null>;
  onSaveSetAdmin: (draft: JobQueueSetAdminDraft) => Promise<string | null>;
  onSaveExitDelete: (groupIds: string[]) => Promise<string | null>;
}

function RequiredMark() {
  return (
    <span className="operations-job-queue-required-mark" aria-hidden="true">
      *
    </span>
  );
}

function loadCreateGroupOptionsFromSettings(platform: Platform) {
  return readCreateGroupWorkerSettings(platform);
}

function CreateSetupSwitchRow({
  label,
  checked,
  disabled = false,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="operations-job-queue-create-row">
      <span className="operations-job-queue-create-row__label">
        {label}
        <RequiredMark />
      </span>
      <div className="operations-job-queue-create-row__control operations-job-queue-create-row__control--switch">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          className={cn('operations-job-queue-switch', checked && 'operations-job-queue-switch--on')}
          disabled={disabled}
          onClick={() => onToggle(!checked)}
        >
          <span className="operations-job-queue-switch__thumb" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function OperationsJobQueueSetupModal({
  open,
  onClose,
  onExited,
  onSaved,
  taskType,
  platform,
  activeBrand,
  selectedAccounts,
  superAdminAccount,
  targetAccountCandidates,
  ownerAccountCandidates,
  selectedOwnerAccountId,
  onOwnerAccountChange,
  createAccountCandidates,
  selectedCreateAccountId,
  onCreateAccountChange,
  preferredCreateTotal,
  preferredSetAdminTargetId,
  preferredExitGroupTab,
  preferredMasterListExpanded,
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
  onSaveJoinCsv,
  onSaveCreate,
  onSaveSetAdmin,
  onSaveExitDelete,
}: OperationsJobQueueSetupModalProps) {
  const { t } = useLanguage();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createTotalLimitAlertOpen, setCreateTotalLimitAlertOpen] = useState(false);
  const [selectedJoinGroupIds, setSelectedJoinGroupIds] = useState<Set<string>>(() => new Set());
  const [csvValidatedRows, setCsvValidatedRows] = useState<ValidatedCsvJoinRow[]>([]);
  const [csvLoading, setCsvLoading] = useState(false);
  const [masterListExpanded, setMasterListExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [joinActiveSource, setJoinActiveSource] = useState<'none' | 'csv' | 'master'>('none');
  const [joinSwitchConfirmPending, setJoinSwitchConfirmPending] = useState(false);
  const [joinGroupQuery, setJoinGroupQuery] = useState('');
  const [exitGroupQuery, setExitGroupQuery] = useState('');
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [createGroupName, setCreateGroupName] = useState('');
  const [createTotalToCreate, setCreateTotalToCreate] = useState('10');
  const [createUseGroupNumbering, setCreateUseGroupNumbering] = useState(false);
  const [createStartFrom, setCreateStartFrom] = useState('1');
  const [createMessagesAdminsOnly, setCreateMessagesAdminsOnly] = useState(false);
  const [createAddMembersAdminsOnly, setCreateAddMembersAdminsOnly] = useState(true);
  const [createInfoAdminsOnly, setCreateInfoAdminsOnly] = useState(true);
  const [createHideChatHistory, setCreateHideChatHistory] = useState(false);
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
  const [createPhotoPath, setCreatePhotoPath] = useState<string | null>(null);
  const [createPhotoPreviewUrl, setCreatePhotoPreviewUrl] = useState<string | null>(null);
  const [createPhotoLoading, setCreatePhotoLoading] = useState(false);
  const [createPhotoUploading, setCreatePhotoUploading] = useState(false);
  const [createPhotoError, setCreatePhotoError] = useState<string | null>(null);
  const [createJobsToday, setCreateJobsToday] = useState<AutomationJobRecord[]>([]);

  const createMaxPerRun = useMemo(() => {
    const settings =
      platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
    return Math.min(
      CREATE_GROUP_MAX_PER_ACCOUNT_RUN,
      Math.max(1, settings.standard.perRun || CREATE_GROUP_MAX_PER_ACCOUNT_RUN),
    );
  }, [platform]);

  const createTotalParsed = Math.max(
    1,
    Math.min(createMaxPerRun, Math.floor(Number(createTotalToCreate)) || 1),
  );

  /** Sama AddBar: load create jobs untuk disable Master yang sudah execute hari ini. */
  useEffect(() => {
    if (!open || taskType !== 'create_group' || !createAccountCandidates?.length) {
      setCreateJobsToday([]);
      return;
    }
    let cancelled = false;
    async function loadCreateJobs() {
      const snapshot = await fetchJobQueueSnapshot({ platform });
      if (cancelled) return;
      setCreateJobsToday(
        (snapshot?.jobs ?? []).filter((job) => job.action === 'create_group'),
      );
    }
    void loadCreateJobs();
    const unsub = window.electronAPI?.jobQueue?.onChanged?.(() => {
      void loadCreateJobs();
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [open, taskType, platform, createAccountCandidates?.length]);

  const createAccountSelectModel = useMemo(
    () =>
      buildCreateGroupAccountSelectModel(
        createAccountCandidates ?? [],
        createJobsToday,
        createMaxPerRun,
        t('operations.jobQueue.createAccountUsedTodaySuffix'),
      ),
    [createAccountCandidates, createJobsToday, createMaxPerRun, t],
  );

  const setAdminOwnerOptions = useMemo(
    () => (ownerAccountCandidates ?? []).map((row) => ({ value: row.id, label: row.accountName })),
    [ownerAccountCandidates],
  );

  const createAccountOptions = createAccountSelectModel.options;
  const createAccountDisabledIds = createAccountSelectModel.disabledIds;

  useEffect(() => {
    if (!open || !onCreateAccountChange) return;
    if (!selectedCreateAccountId) return;
    if (createAccountDisabledIds.includes(selectedCreateAccountId)) {
      onCreateAccountChange('');
    }
  }, [open, selectedCreateAccountId, createAccountDisabledIds, onCreateAccountChange]);

  const setAdminOwnerDisabledIds = useMemo(
    () =>
      (ownerAccountCandidates ?? [])
        .filter((row) => row.sessionStatus !== 'valid' || !row.phoneNumber?.trim())
        .map((row) => row.id),
    [ownerAccountCandidates],
  );

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

  const eligibleJoinGroups = useMemo(() => {
    const accountIds = new Set(selectedAccounts.map((row) => row.id));
    if (accountIds.size === 0) return [];
    return joinableGroups.filter((group) => {
      const eligible = joinGroupAccountIds[group.groupId] ?? [];
      return eligible.some((id) => accountIds.has(id));
    });
  }, [joinGroupAccountIds, joinableGroups, selectedAccounts]);

  const visibleJoinGroups = useMemo(() => {
    const q = joinGroupQuery.trim().toLowerCase();
    if (!q) return eligibleJoinGroups;
    return eligibleJoinGroups.filter((group) => {
      const name = group.groupName.toLowerCase();
      const id = group.groupId.toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [eligibleJoinGroups, joinGroupQuery]);

  const allJoinGroupsSelected =
    visibleJoinGroups.length > 0 &&
    visibleJoinGroups.every((group) => selectedJoinGroupIds.has(group.groupId));

  const allSetAdminGroupsSelected =
    eligibleSetAdminGroups.length > 0 &&
    eligibleSetAdminGroups.every((group) => selectedSetAdminGroupIds.has(group.groupId));

  const exitGroupsForTab = useMemo((): AccountDailyGroupForLeaveDelete[] => {
    return exitGroupTab === 'daily' ? accountExitGroups.daily : accountExitGroups.junk;
  }, [accountExitGroups.daily, accountExitGroups.junk, exitGroupTab]);

  const visibleExitGroups = useMemo((): AccountDailyGroupForLeaveDelete[] => {
    const q = exitGroupQuery.trim().toLowerCase();
    if (!q) return exitGroupsForTab;
    return exitGroupsForTab.filter((group) => {
      const name = group.groupName.toLowerCase();
      const id = group.groupId.toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [exitGroupQuery, exitGroupsForTab]);

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

  function setCreateGroupPermissionLocal(patch: {
    messagesAdminsOnly?: boolean;
    addMembersAdminsOnly?: boolean;
    infoAdminsOnly?: boolean;
    hideChatHistoryForMembers?: boolean;
  }) {
    if (patch.messagesAdminsOnly !== undefined) {
      setCreateMessagesAdminsOnly(patch.messagesAdminsOnly);
    }
    if (patch.addMembersAdminsOnly !== undefined) {
      setCreateAddMembersAdminsOnly(patch.addMembersAdminsOnly);
    }
    if (patch.infoAdminsOnly !== undefined) {
      setCreateInfoAdminsOnly(patch.infoAdminsOnly);
    }
    if (patch.hideChatHistoryForMembers !== undefined) {
      setCreateHideChatHistory(patch.hideChatHistoryForMembers);
    }
  }

  function loadCreateGroupPermissionDefaultsFromSettings() {
    const createGroup = loadCreateGroupOptionsFromSettings(platform);
    setCreateMessagesAdminsOnly(createGroup.messagesAdminsOnly);
    setCreateAddMembersAdminsOnly(createGroup.addMembersAdminsOnly);
    setCreateInfoAdminsOnly(createGroup.infoAdminsOnly);
    setCreateHideChatHistory(createGroup.hideChatHistoryForMembers);
  }

  function handleCreateTotalToCreateChange(raw: string) {
    setCreateTotalToCreate(raw);
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n)) return;
    if (n > createMaxPerRun) {
      setCreateTotalLimitAlertOpen(true);
      setCreateTotalToCreate(String(createMaxPerRun));
    }
  }

  function collectCreateGroupValidationMessages(): string[] {
    return collectCreateGroupSetupValidationCodes({
      groupName: createGroupName,
      totalToCreateRaw: createTotalToCreate,
      useGroupNumbering: createUseGroupNumbering,
      startFromRaw: createStartFrom,
      hasSelectedAccount: selectedAccounts.length > 0,
      maxPerRun: createMaxPerRun,
    }).map((code) =>
      code === 'createTotalInvalid'
        ? t('operations.jobQueue.createTotalInvalid', { max: String(createMaxPerRun) })
        : t(`operations.jobQueue.${code}`),
    );
  }

  function currentCreateGroupPermissionDraft() {
    return {
      messagesAdminsOnly: createMessagesAdminsOnly,
      addMembersAdminsOnly: createAddMembersAdminsOnly,
      infoAdminsOnly: createInfoAdminsOnly,
      hideChatHistoryForMembers: createHideChatHistory,
    };
  }

  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    setSelectedJoinGroupIds(new Set());
    setCreateGroupName('');
    setCreateTotalToCreate('10');
    setCreateUseGroupNumbering(false);
    setCreateStartFrom('1');
    setCreateTotalLimitAlertOpen(false);
    loadCreateGroupPermissionDefaultsFromSettings();
    setSelectedSetAdminGroupIds(new Set());
    setSelectedLeaveDeleteGroupIds(new Set());
    setExitGroupTab(preferredExitGroupTab === 'junk' ? 'junk' : 'daily');
    setExitGroupPage(1);
    setExitGroupProcessedAlertOpen(false);
    setSelectedSetAdminTargetAccountId('');
    setEligibleSetAdminGroups([]);
    // Foto brand: jangan di-clear di sini — owned oleh effect load create photo
    // (targetAccountCandidates/array parent sering re-create → wipe preview yang sudah ada).
    setCreatePhotoError(null);
    setCsvValidatedRows([]);
    setCsvLoading(false);
    setMasterListExpanded(Boolean(preferredMasterListExpanded));
    setDragOver(false);
    /** CTA Join Missing: expand master, tapi CSV tetap aktif (jangan lock ke master). */
    setJoinActiveSource('none');
    setJoinSwitchConfirmPending(false);
    setJoinGroupQuery('');
    setExitGroupQuery('');
  }, [
    open,
    taskType,
    activeBrand,
    platform,
    preferredExitGroupTab,
    preferredMasterListExpanded,
  ]);

  useEffect(() => {
    if (!open || taskType !== 'set_admin') return;
    const preferredOk =
      preferredSetAdminTargetId &&
      targetAccountCandidates.some((row) => row.id === preferredSetAdminTargetId);
    if (preferredOk && preferredSetAdminTargetId) {
      setSelectedSetAdminTargetAccountId(preferredSetAdminTargetId);
    }
  }, [open, taskType, preferredSetAdminTargetId, targetAccountCandidates]);

  useEffect(() => {
    if (!open || taskType !== 'create_group') return;
    if (preferredCreateTotal == null || preferredCreateTotal <= 0) return;
    const capped = Math.min(createMaxPerRun, Math.max(1, Math.floor(preferredCreateTotal)));
    setCreateTotalToCreate(String(capped));
  }, [open, taskType, preferredCreateTotal, createMaxPerRun]);

  const processJoinImportFile = useCallback(async (file: File) => {
    setCsvLoading(true);
    setCsvValidatedRows([]);
    setJoinActiveSource('csv');
    setSelectedJoinGroupIds(new Set());
    setMasterListExpanded(false);
    setJoinSwitchConfirmPending(false);
    try {
      const parsed = await parseJoinImportFile(file);
      if (parsed.rows.length === 0) {
        setCsvLoading(false);
        return;
      }
      const accountIds = selectedAccounts.map((a) => a.id);
      const result = await validateCsvJoinAgainstMaster({
        csvRows: parsed.rows,
        brandName: activeBrand,
        platform,
        accountIds,
      });
      setCsvValidatedRows(result.rows);
    } catch {
      setCsvValidatedRows([]);
    } finally {
      setCsvLoading(false);
    }
  }, [activeBrand, platform, selectedAccounts]);

  const handleCsvFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = '';
    if (!file) return;
    await processJoinImportFile(file);
  }, [processJoinImportFile]);

  const handleCsvFileDrop = useCallback(async (file: File) => {
    await processJoinImportFile(file);
  }, [processJoinImportFile]);

  const csvMatchedGroups = useMemo(
    () => csvValidatedRows.filter((r) => r.status === 'matched'),
    [csvValidatedRows],
  );
  const csvSkippedCount = useMemo(
    () => csvValidatedRows.filter((r) => r.status !== 'matched').length,
    [csvValidatedRows],
  );

  useEffect(() => {
    if (!open || taskType !== 'create_group' || !activeBrand) {
      if (!open) {
        setCreatePhotoPath(null);
        setCreatePhotoPreviewUrl(null);
        setCreatePhotoLoading(false);
      }
      return;
    }
    let cancelled = false;
    setCreatePhotoLoading(true);
    setCreatePhotoError(null);
    void (async () => {
      try {
        const result = await resolveBrandGroupPhotoPath(activeBrand);
        if (cancelled) return;
        if (!result.ok) {
          setCreatePhotoPath(null);
          setCreatePhotoPreviewUrl(null);
          return;
        }

        const localPath = result.path.startsWith('http')
          ? await ensureLocalBrandGroupPhoto(activeBrand)
          : result.path;
        if (cancelled) return;

        const pathForJob = localPath ?? result.path;
        setCreatePhotoPath(pathForJob);
        const url = await brandGroupPhotoPreviewUrl(pathForJob);
        if (!cancelled) setCreatePhotoPreviewUrl(url);
      } finally {
        if (!cancelled) setCreatePhotoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, taskType, activeBrand]);

  async function handleCreateBrandPhotoUpload(): Promise<void> {
    if (!activeBrand.trim() || createPhotoUploading || saving) return;
    setCreatePhotoUploading(true);
    setCreatePhotoError(null);
    try {
      const result = await pickAndSaveBrandGroupPhoto(activeBrand);
      if (!result.ok) {
        if (result.error === 'CANCELLED') return;
        setCreatePhotoError(
          result.error === 'DESKTOP_REQUIRED'
            ? t('admin.brandPhoto.uploadDesktopRequired')
            : t('admin.brandPhoto.uploadFailed'),
        );
        return;
      }
      setCreatePhotoPath(result.path);
      const url =
        result.dataUrl ?? (await brandGroupPhotoPreviewUrl(result.path));
      setCreatePhotoPreviewUrl(url);
    } finally {
      setCreatePhotoUploading(false);
    }
  }

  useEffect(() => {
    setExitGroupPage(1);
  }, [exitGroupTab, exitGroupQuery]);

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

  function switchToMasterSource() {
    setJoinActiveSource('master');
    setCsvValidatedRows([]);
    setCsvLoading(false);
    setJoinSwitchConfirmPending(false);
    if (csvFileRef.current) csvFileRef.current.value = '';
  }

  function toggleJoinGroup(groupId: string) {
    if (joinActiveSource === 'csv' && csvValidatedRows.length > 0) {
      setJoinSwitchConfirmPending(true);
      return;
    }
    if (joinActiveSource !== 'master') setJoinActiveSource('master');
    setSelectedJoinGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function toggleAllJoinGroups() {
    if (joinActiveSource === 'csv' && csvValidatedRows.length > 0) {
      setJoinSwitchConfirmPending(true);
      return;
    }
    if (joinActiveSource !== 'master') setJoinActiveSource('master');
    if (allJoinGroupsSelected) {
      setSelectedJoinGroupIds(new Set());
      return;
    }
    setSelectedJoinGroupIds(new Set(visibleJoinGroups.map((group) => group.groupId)));
  }

  function confirmSwitchToMaster() {
    switchToMasterSource();
    setMasterListExpanded(true);
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
      if (joinActiveSource === 'csv' && csvMatchedGroups.length > 0) {
        message = await onSaveJoinCsv(
          csvMatchedGroups.map((r) => ({
            groupId: r.groupId,
            groupName: r.groupName,
            inviteLink: r.inviteLink,
          })),
        );
      } else if (joinActiveSource === 'master' && selectedJoinGroupIds.size > 0) {
        message = await onSaveJoin([...selectedJoinGroupIds]);
      } else {
        setSaveError(t('operations.jobQueue.csvNoMatchedGroups'));
        return;
      }
    } else if (taskType === 'create_group') {
      const validationMessages = collectCreateGroupValidationMessages();
      if (validationMessages.length > 0) {
        setSaveError(validationMessages.join('\n'));
        return;
      }

      const permissionDraft = currentCreateGroupPermissionDraft();

      message = await onSaveCreate({
        groupName: createGroupName.trim(),
        totalToCreate: createTotalParsed,
        useGroupNumbering: createUseGroupNumbering,
        startFrom: Math.max(1, Math.floor(Number(createStartFrom)) || 1),
        createGroupSettings:
          platform === 'whatsapp'
            ? {
                messagesAdminsOnly: permissionDraft.messagesAdminsOnly,
                addMembersAdminsOnly: permissionDraft.addMembersAdminsOnly,
                infoAdminsOnly: permissionDraft.infoAdminsOnly,
              }
            : undefined,
        hideChatHistoryForMembers:
          platform === 'telegram' ? permissionDraft.hideChatHistoryForMembers : undefined,
        photoPath: createPhotoPath ?? undefined,
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
    if (onSaved) {
      requestAnimationFrame(() => onSaved(message));
    }
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

  const createGroupPlatformLabel =
    platform === 'whatsapp'
      ? t('groupMonitoring.brandMasterDetail.platformWa')
      : t('groupMonitoring.brandMasterDetail.platformTg');

  const modalSubtitle =
    taskType === 'create_group'
      ? [
          createGroupPlatformLabel,
          activeBrand,
          reportingAccountDisplayName(
            selectedAccounts[0]?.accountName ?? '',
            activeBrand,
          ) || '—',
        ].join(' | ')
      : `${activeBrand} · ${t(tabLabelKey)}`;

  const canSaveJoin =
    selectedAccounts.length > 0 &&
    ((joinActiveSource === 'csv' && csvMatchedGroups.length > 0) ||
     (joinActiveSource === 'master' && selectedJoinGroupIds.size > 0));
  const canSaveCreate =
    createGroupName.trim().length > 0 && selectedAccounts.length > 0 && Boolean(createPhotoPath);
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
    <BrandModalRoot open={open} onBackdropClick={saving ? undefined : onClose} onExited={onExited}>
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
              {modalSubtitle}
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
              {/* Drop zone — Import CSV hanya untuk Join Missing */}
              <div
                className={cn(
                  'operations-job-queue-dropzone',
                  dragOver && 'operations-job-queue-dropzone--dragover',
                )}
                onClick={() => csvFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) void handleCsvFileDrop(file);
                }}
              >
                <input
                  ref={csvFileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="operations-job-queue-csv-file-input"
                  onChange={(e) => void handleCsvFileChange(e)}
                  disabled={saving || csvLoading}
                />
                <FileUp className="operations-job-queue-dropzone__icon" size={28} aria-hidden />
                <p className="operations-job-queue-dropzone__text">
                  {t('operations.jobQueue.csvDropzoneText')}
                </p>
              </div>

              {/* CSV validation results */}
              {csvLoading ? (
                <p className="operations-job-queue-empty">
                  <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden />{' '}
                  {t('operations.jobQueue.csvValidating')}
                </p>
              ) : csvValidatedRows.length > 0 ? (
                <>
                  <p className="operations-job-queue-csv-summary">
                    {t('operations.jobQueue.csvSummary', {
                      matched: String(csvMatchedGroups.length),
                      skipped: String(csvSkippedCount),
                    })}
                  </p>
                  <div className="operations-job-queue-table-wrap operations-job-queue-table-wrap--scroll-body">
                    <table className="operations-job-queue-table operations-job-queue-table--missing">
                      <thead>
                        <tr>
                          <th>{t('operations.jobQueue.csvColGroup')}</th>
                          <th>{t('operations.jobQueue.csvColGroupId')}</th>
                          <th>{t('operations.jobQueue.csvColStatus')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvValidatedRows.map((row, idx) => (
                          <tr key={row.groupId || idx}>
                            <td>{row.groupName}</td>
                            <td className="group-links-table__id">{row.groupId || '—'}</td>
                            <td>
                              <span className={`operations-job-queue-csv-status operations-job-queue-csv-status--${row.status.replace('_', '-')}`}>
                                {row.status === 'matched'
                                  ? t('operations.jobQueue.csvStatusMatched')
                                  : row.status === 'already_joined'
                                    ? t('operations.jobQueue.csvStatusAlreadyJoined')
                                    : t('operations.jobQueue.csvStatusNotInMaster')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {/* Micro-confirmation: switching from CSV to master */}
              {joinSwitchConfirmPending ? (
                <div className="operations-job-queue-switch-confirm">
                  <span>{t('operations.jobQueue.csvSwitchConfirm')}</span>
                  <button type="button" onClick={confirmSwitchToMaster}>
                    {t('operations.jobQueue.csvSwitchYes')}
                  </button>
                  <button type="button" onClick={() => setJoinSwitchConfirmPending(false)}>
                    {t('operations.jobQueue.csvSwitchNo')}
                  </button>
                </div>
              ) : null}

              {/* Accordion — select from master list (secondary) */}
              <div className={cn(joinActiveSource === 'csv' && 'operations-job-queue-section--inactive')}>
                <button
                  type="button"
                  className={cn('operations-job-queue-master-accordion', masterListExpanded && 'operations-job-queue-master-accordion--open')}
                  onClick={() => setMasterListExpanded((v) => !v)}
                >
                  <ChevronRight className="operations-job-queue-master-accordion__chevron" size={14} />
                  <span>
                    {t('operations.jobQueue.csvMasterAccordion', {
                      count: String(eligibleJoinGroups.length),
                    })}
                  </span>
                </button>

                {masterListExpanded ? (
                  <>
                    <div className="operations-job-queue-group-search">
                      <input
                        type="search"
                        value={joinGroupQuery}
                        onChange={(event) => setJoinGroupQuery(event.target.value)}
                        placeholder={t('operations.jobQueue.groupListSearchPlaceholder')}
                        className="operations-job-queue-group-search-input"
                        disabled={saving || loadingJoinGroups}
                        aria-label={t('operations.jobQueue.groupListSearchPlaceholder')}
                      />
                    </div>
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
                              {joinGroupQuery.trim()
                                ? t('operations.jobQueue.noGroupSearchMatch')
                                : t('operations.jobQueue.noMissingGroups')}
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
                  </>
                ) : null}
              </div>

              {/* Queue summary */}
              {joinActiveSource === 'csv' && csvMatchedGroups.length > 0 ? (
                <p className="operations-job-queue-join-summary">
                  {t('operations.jobQueue.joinQueueSummaryCsv', { count: String(csvMatchedGroups.length) })}
                </p>
              ) : joinActiveSource === 'master' && selectedJoinGroupIds.size > 0 ? (
                <p className="operations-job-queue-join-summary">
                  {t('operations.jobQueue.joinQueueSummaryMaster', { count: String(selectedJoinGroupIds.size) })}
                </p>
              ) : null}
            </div>
          ) : null}

          {taskType === 'create_group' ? (
            <div className="operations-job-queue-setup-form operations-job-queue-setup-form--create">
              {createAccountCandidates && onCreateAccountChange ? (
                <div className="operations-job-queue-create-account-filter operations-job-queue-setup-form__full">
                  <span className="operations-job-queue-create-account-filter__label">
                    {t('operations.jobQueue.account')}
                    <RequiredMark />
                  </span>
                  <DarkSelect
                    value={selectedCreateAccountId ?? ''}
                    onChange={onCreateAccountChange}
                    options={createAccountOptions}
                    disabledValues={createAccountDisabledIds}
                    ariaLabel={t('operations.jobQueue.account')}
                    triggerClassName="account-slicer-select operations-job-queue-select"
                    disabled={saving}
                    placeholder={t('operations.jobQueue.selectAccount')}
                  />
                </div>
              ) : null}
              <div className="operations-job-queue-create-cards operations-job-queue-setup-form__full">
                <div className="operations-job-queue-create-column">
                  <h4 className="operations-job-queue-create-card__title">
                    {t('operations.jobQueue.createSetupCardBatch')}
                  </h4>
                  <section className="operations-job-queue-create-card operations-job-queue-create-card--batch">
                    <div className="operations-job-queue-create-row">
                      <span className="operations-job-queue-create-row__label">
                        {t('operations.jobQueue.createGroupName')}
                        <RequiredMark />
                      </span>
                      <div className="operations-job-queue-create-row__control">
                        <input
                          type="text"
                          value={createGroupName}
                          onChange={(event) => setCreateGroupName(event.target.value)}
                          placeholder={t('operations.jobQueue.createGroupNamePlaceholder')}
                          disabled={saving}
                        />
                      </div>
                    </div>
                    <div className="operations-job-queue-create-row">
                      <span className="operations-job-queue-create-row__label">
                        {t('operations.jobQueue.createTotalToCreate')}
                        <RequiredMark />
                      </span>
                      <div className="operations-job-queue-create-row__control">
                        <input
                          type="number"
                          min={1}
                          value={createTotalToCreate}
                          onChange={(event) => handleCreateTotalToCreateChange(event.target.value)}
                          disabled={saving}
                        />
                      </div>
                    </div>
                    <div className="operations-job-queue-create-row">
                      <div className="operations-job-queue-create-row__label operations-job-queue-create-row__label--with-switch">
                        <span>
                          {t('operations.jobQueue.createStartFrom')}
                          <RequiredMark />
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={createUseGroupNumbering}
                          aria-label={t('operations.jobQueue.createUseGroupNumbering')}
                          className={cn(
                            'operations-job-queue-switch',
                            createUseGroupNumbering && 'operations-job-queue-switch--on',
                          )}
                          disabled={saving}
                          onClick={() => setCreateUseGroupNumbering((value) => !value)}
                        >
                          <span className="operations-job-queue-switch__thumb" aria-hidden />
                        </button>
                      </div>
                      <div className="operations-job-queue-create-row__control">
                        <input
                          type="number"
                          min={1}
                          value={createStartFrom}
                          onChange={(event) => setCreateStartFrom(event.target.value)}
                          disabled={saving || !createUseGroupNumbering}
                          aria-label={t('operations.jobQueue.createStartFrom')}
                        />
                      </div>
                    </div>
                  </section>
                </div>

                <div className="operations-job-queue-create-column">
                  <h4 className="operations-job-queue-create-card__title">
                    {t('operations.jobQueue.createSetupCardPermissions')}
                  </h4>
                  <section className="operations-job-queue-create-card">
                  {platform === 'whatsapp' ? (
                    <>
                      <CreateSetupSwitchRow
                        label={t('operations.jobQueue.createPermMessagesAdminsOnly')}
                        checked={createMessagesAdminsOnly}
                        disabled={saving}
                        onToggle={(next) =>
                          setCreateGroupPermissionLocal({ messagesAdminsOnly: next })
                        }
                      />
                      <CreateSetupSwitchRow
                        label={t('operations.jobQueue.createPermAddMembersAdminsOnly')}
                        checked={createAddMembersAdminsOnly}
                        disabled={saving}
                        onToggle={(next) =>
                          setCreateGroupPermissionLocal({ addMembersAdminsOnly: next })
                        }
                      />
                      <CreateSetupSwitchRow
                        label={t('operations.jobQueue.createPermInfoAdminsOnly')}
                        checked={createInfoAdminsOnly}
                        disabled={saving}
                        onToggle={(next) => setCreateGroupPermissionLocal({ infoAdminsOnly: next })}
                      />
                    </>
                  ) : (
                    <CreateSetupSwitchRow
                      label={t('operations.jobQueue.createPermHideChatHistory')}
                      checked={createHideChatHistory}
                      disabled={saving}
                      onToggle={(next) =>
                        setCreateGroupPermissionLocal({ hideChatHistoryForMembers: next })
                      }
                    />
                  )}
                  </section>
                </div>

                <div className="operations-job-queue-create-column">
                  <h4 className="operations-job-queue-create-card__title">
                    {createPhotoPreviewUrl && createPhotoPath
                      ? t('admin.brandPhoto.previewCard')
                      : t('admin.brandPhoto.uploadCard')}
                    <span className="operations-job-queue-required-mark" aria-hidden="true"> *</span>
                  </h4>
                  <section className="operations-job-queue-create-card operations-job-queue-create-card--photo">
                    {createPhotoLoading || createPhotoUploading ? (
                      <div className="operations-job-queue-photo-loading">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      </div>
                    ) : createPhotoPreviewUrl && createPhotoPath ? (
                      <>
                        <div className="operations-job-queue-photo-preview">
                          <img
                            src={createPhotoPreviewUrl}
                            alt={activeBrand}
                            className="operations-job-queue-photo-preview__img"
                          />
                        </div>
                        <div className="operations-job-queue-photo-below">
                          <button
                            type="button"
                            className="operations-job-queue-photo-upload-btn"
                            disabled={saving || createPhotoUploading || !activeBrand.trim()}
                            onClick={() => void handleCreateBrandPhotoUpload()}
                          >
                            {t('admin.brandPhoto.change')}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="operations-job-queue-photo-empty">
                        <ImagePlus className="operations-job-queue-photo-empty__icon" size={24} />
                        <p className="operations-job-queue-photo-empty__caption">
                          {t('admin.brandPhoto.createUploadRequired')}
                        </p>
                        <button
                          type="button"
                          className="operations-job-queue-photo-upload-btn operations-job-queue-photo-upload-btn--primary"
                          disabled={saving || !activeBrand.trim()}
                          onClick={() => void handleCreateBrandPhotoUpload()}
                        >
                          {t('admin.brandPhoto.upload')}
                        </button>
                      </div>
                    )}
                  </section>
                  {createPhotoError ? (
                    <p className="operations-job-queue-error" role="alert">
                      {createPhotoError}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {taskType === 'set_admin' ? (
            <div className="operations-job-queue-setup-form operations-job-queue-setup-form--set-admin">
              <p className="operations-job-queue-form-note">
                {t('operations.jobQueue.setAdminHint')}
              </p>
              {ownerAccountCandidates && onOwnerAccountChange ? (
                <div className="operations-job-queue-field">
                  <span>{t('operations.jobQueue.setAdminSuperAccount')}</span>
                  {setAdminOwnerOptions.length === 0 ? (
                    <span className="operations-schedule-join-empty">
                      {t('operations.jobQueue.noAccounts')}
                    </span>
                  ) : (
                    <DarkSelect
                      value={selectedOwnerAccountId ?? ''}
                      onChange={(value) => {
                        onOwnerAccountChange(value);
                        setSelectedSetAdminGroupIds(new Set());
                      }}
                      options={setAdminOwnerOptions}
                      disabledValues={setAdminOwnerDisabledIds}
                      ariaLabel={t('operations.jobQueue.setAdminSuperAccount')}
                      triggerClassName="account-slicer-select operations-job-queue-select"
                      disabled={saving}
                      placeholder={t('operations.jobQueue.selectAccount')}
                    />
                  )}
                </div>
              ) : null}
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
                    disabled={saving || (Boolean(ownerAccountCandidates) && !superAdminAccount)}
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
                    ) : ownerAccountCandidates && !superAdminAccount ? (
                      <tr>
                        <td colSpan={2} className="operations-job-queue-empty">
                          {t('operations.jobQueue.setAdminSelectOwnerFirst')}
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
              <div className="operations-job-queue-group-search">
                <input
                  type="search"
                  value={exitGroupQuery}
                  onChange={(event) => setExitGroupQuery(event.target.value)}
                  placeholder={t('operations.jobQueue.groupListSearchPlaceholder')}
                  className="operations-job-queue-group-search-input"
                  disabled={saving || loadingAccountDailyGroups}
                  aria-label={t('operations.jobQueue.groupListSearchPlaceholder')}
                />
              </div>
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
                          {exitGroupQuery.trim()
                            ? t('operations.jobQueue.noGroupSearchMatch')
                            : exitGroupTab === 'daily'
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

          {saveError ? (
            <div className="brand-modal-error" role="alert">
              {saveError.includes('\n') ? (
                <>
                  <p>{t('operations.jobQueue.createSetupMissingFields')}</p>
                  <ul className="operations-job-queue-setup-missing-list">
                    {saveError.split('\n').map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              ) : (
                saveError
              )}
            </div>
          ) : null}
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

    <BrandModalRoot
      open={exitGroupProcessedAlertOpen}
      onBackdropClick={() => setExitGroupProcessedAlertOpen(false)}
    >
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

    <BrandModalRoot
      open={createTotalLimitAlertOpen}
      onBackdropClick={() => setCreateTotalLimitAlertOpen(false)}
    >
      <div
        className="brand-modal-panel brand-modal-panel--sync"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="create-total-limit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="create-total-limit-title" className="brand-modal-title">
            {t('operations.jobQueue.setupModalTitleCreate')}
          </h2>
          <button
            type="button"
            className="brand-modal-close"
            onClick={() => setCreateTotalLimitAlertOpen(false)}
            aria-label={t('groupMonitoring.accountCard.closeModal')}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>
        <div className="brand-modal-form">
          <p className="sync-modal-message sync-modal-message--error">
            {t('operations.jobQueue.createTotalInvalid', { max: String(createMaxPerRun) })}
          </p>
          <div className="brand-modal-actions">
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--primary"
              onClick={() => setCreateTotalLimitAlertOpen(false)}
            >
              {t('groupMonitoring.sync.ok')}
            </button>
          </div>
        </div>
      </div>
    </BrandModalRoot>
    </>
  );
}
