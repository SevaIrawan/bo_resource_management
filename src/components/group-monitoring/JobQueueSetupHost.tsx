import { useEffect, useMemo, useState } from 'react';
import {
  OperationsJobQueueSetupModal,
  type JobQueueCreateGroupDraft,
  type JobQueueSetAdminDraft,
} from '@/components/group-monitoring/OperationsJobQueueSetupModal';
import { useJobQueueSetupEnqueue } from '@/hooks/useJobQueueSetupEnqueue';
import { useLanguage } from '@/hooks/useLanguage';
import type { JobQueueTaskType } from '@/lib/operationsJobQueueUi';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export type { JobQueueCreateGroupDraft, JobQueueSetAdminDraft };

/** Alias shared — modal setup Job Queue (bukan milik tab Operations saja). */
export { OperationsJobQueueSetupModal as JobQueueSetupModal };

interface JobQueueSetupHostProps {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
  onSaved?: (message: string) => void;
  onFeedback?: (message: string) => void;
  taskType: JobQueueTaskType;
  platform: Platform;
  activeBrand: string;
  selectedAccounts: AccountBrandRow[];
  /** Owner tetap dari parent (Operations AddBar). */
  superAdminAccount: AccountBrandRow | undefined;
  targetAccountCandidates: AccountBrandRow[];
  validAccounts: AccountBrandRow[];
  /**
   * Opsi A — Account CTA Set admin: user pilih OWNER/ADMIN di SETUP.
   * Jika diisi, superAdminAccount diabaikan sampai user pilih.
   */
  ownerAccountCandidates?: AccountBrandRow[];
  /**
   * Account CTA To prep / Create: user pilih Master di SETUP.
   * Jika diisi, selectedAccounts diabaikan sampai user pilih.
   */
  createAccountCandidates?: AccountBrandRow[];
  /** Prefill total create (mis. To prep gap). */
  preferredCreateTotal?: number;
  preferredSetAdminTargetId?: string;
  preferredExitGroupTab?: 'daily' | 'junk';
  preferredMasterListExpanded?: boolean;
}

/**
 * Shared host: load data + Setup modal + enqueue.
 * Dipakai dari Account (per-baris / To prep) dan Operations AddBar.
 */
export function JobQueueSetupHost({
  open,
  onClose,
  onExited,
  onSaved,
  onFeedback,
  taskType,
  platform,
  activeBrand,
  selectedAccounts,
  superAdminAccount,
  targetAccountCandidates,
  validAccounts,
  ownerAccountCandidates,
  createAccountCandidates,
  preferredCreateTotal,
  preferredSetAdminTargetId,
  preferredExitGroupTab,
  preferredMasterListExpanded,
}: JobQueueSetupHostProps) {
  const { t } = useLanguage();
  const pickOwnerInModal = (ownerAccountCandidates?.length ?? 0) > 0;
  const pickCreateAccountInModal =
    taskType === 'create_group' && (createAccountCandidates?.length ?? 0) > 0;
  const [pickedOwnerAccountId, setPickedOwnerAccountId] = useState('');
  const [pickedCreateAccountId, setPickedCreateAccountId] = useState('');

  useEffect(() => {
    if (!open) return;
    if (pickOwnerInModal) {
      setPickedOwnerAccountId('');
      return;
    }
    setPickedOwnerAccountId(superAdminAccount?.id ?? '');
  }, [open, pickOwnerInModal, superAdminAccount?.id]);

  useEffect(() => {
    if (!open) return;
    if (pickCreateAccountInModal) {
      setPickedCreateAccountId('');
      return;
    }
    setPickedCreateAccountId(selectedAccounts[0]?.id ?? '');
  }, [open, pickCreateAccountInModal, selectedAccounts]);

  const resolvedSuperAdmin = useMemo(() => {
    if (pickOwnerInModal) {
      return (
        ownerAccountCandidates?.find((row) => row.id === pickedOwnerAccountId) ??
        validAccounts.find((row) => row.id === pickedOwnerAccountId)
      );
    }
    return superAdminAccount;
  }, [
    ownerAccountCandidates,
    pickOwnerInModal,
    pickedOwnerAccountId,
    superAdminAccount,
    validAccounts,
  ]);

  const resolvedCreateAccounts = useMemo((): AccountBrandRow[] => {
    if (!pickCreateAccountInModal) return selectedAccounts;
    const picked =
      createAccountCandidates?.find((row) => row.id === pickedCreateAccountId) ??
      validAccounts.find((row) => row.id === pickedCreateAccountId);
    return picked ? [picked] : [];
  }, [
    createAccountCandidates,
    pickCreateAccountInModal,
    pickedCreateAccountId,
    selectedAccounts,
    validAccounts,
  ]);

  const resolvedTargetCandidates = useMemo(() => {
    if (!resolvedSuperAdmin) return targetAccountCandidates;
    return targetAccountCandidates.filter((row) => row.id !== resolvedSuperAdmin.id);
  }, [resolvedSuperAdmin, targetAccountCandidates]);

  const enqueue = useJobQueueSetupEnqueue({
    open,
    taskType,
    platform,
    activeBrand,
    selectedAccounts: resolvedCreateAccounts,
    superAdminAccount: resolvedSuperAdmin,
    validAccounts,
    t,
    onFeedback,
  });

  return (
    <OperationsJobQueueSetupModal
      open={open}
      onClose={onClose}
      onExited={onExited}
      onSaved={onSaved}
      taskType={taskType}
      platform={platform}
      activeBrand={activeBrand}
      selectedAccounts={resolvedCreateAccounts}
      superAdminAccount={resolvedSuperAdmin}
      targetAccountCandidates={resolvedTargetCandidates}
      ownerAccountCandidates={pickOwnerInModal ? ownerAccountCandidates : undefined}
      selectedOwnerAccountId={pickOwnerInModal ? pickedOwnerAccountId : undefined}
      onOwnerAccountChange={pickOwnerInModal ? setPickedOwnerAccountId : undefined}
      createAccountCandidates={
        pickCreateAccountInModal ? createAccountCandidates : undefined
      }
      selectedCreateAccountId={
        pickCreateAccountInModal ? pickedCreateAccountId : undefined
      }
      onCreateAccountChange={
        pickCreateAccountInModal ? setPickedCreateAccountId : undefined
      }
      preferredCreateTotal={preferredCreateTotal}
      preferredSetAdminTargetId={preferredSetAdminTargetId}
      preferredExitGroupTab={preferredExitGroupTab}
      preferredMasterListExpanded={preferredMasterListExpanded}
      joinableGroups={enqueue.joinableGroups}
      joinGroupAccountIds={enqueue.joinGroupAccountIds}
      loadingJoinGroups={enqueue.loadingJoinGroups}
      superAdminGroups={enqueue.superAdminGroups}
      loadingSuperAdminGroups={enqueue.loadingSuperAdminGroups}
      accountExitGroups={enqueue.accountExitGroups}
      processedExitGroupIds={enqueue.processedExitGroupIds}
      loadingAccountDailyGroups={enqueue.loadingAccountDailyGroups}
      saving={enqueue.submitting}
      onSaveJoin={(groupIds) => enqueue.saveJoinBatch(groupIds)}
      onSaveJoinCsv={(groups) => enqueue.saveJoinCsvBatch(groups)}
      onSaveCreate={(draft) => enqueue.saveCreateBatch(draft)}
      onSaveSetAdmin={(draft) => enqueue.saveSetAdminBatch(draft)}
      onSaveExitDelete={(groupIds) => enqueue.saveExitBatch(groupIds)}
    />
  );
}
