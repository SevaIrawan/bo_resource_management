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
  preferredSetAdminTargetId?: string;
  preferredExitGroupTab?: 'daily' | 'junk';
  preferredMasterListExpanded?: boolean;
}

/**
 * Shared host: load data + Setup modal + enqueue.
 * Dipakai dari Account (per-baris) dan Operations AddBar.
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
  preferredSetAdminTargetId,
  preferredExitGroupTab,
  preferredMasterListExpanded,
}: JobQueueSetupHostProps) {
  const { t } = useLanguage();
  const pickOwnerInModal = (ownerAccountCandidates?.length ?? 0) > 0;
  const [pickedOwnerAccountId, setPickedOwnerAccountId] = useState('');

  useEffect(() => {
    if (!open) return;
    if (pickOwnerInModal) {
      setPickedOwnerAccountId('');
      return;
    }
    setPickedOwnerAccountId(superAdminAccount?.id ?? '');
  }, [open, pickOwnerInModal, superAdminAccount?.id]);

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

  const resolvedTargetCandidates = useMemo(() => {
    if (!resolvedSuperAdmin) return targetAccountCandidates;
    return targetAccountCandidates.filter((row) => row.id !== resolvedSuperAdmin.id);
  }, [resolvedSuperAdmin, targetAccountCandidates]);

  const enqueue = useJobQueueSetupEnqueue({
    open,
    taskType,
    platform,
    activeBrand,
    selectedAccounts,
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
      selectedAccounts={selectedAccounts}
      superAdminAccount={resolvedSuperAdmin}
      targetAccountCandidates={resolvedTargetCandidates}
      ownerAccountCandidates={pickOwnerInModal ? ownerAccountCandidates : undefined}
      selectedOwnerAccountId={pickOwnerInModal ? pickedOwnerAccountId : undefined}
      onOwnerAccountChange={pickOwnerInModal ? setPickedOwnerAccountId : undefined}
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
