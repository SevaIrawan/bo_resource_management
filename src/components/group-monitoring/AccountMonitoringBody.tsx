import { useEffect, useMemo } from 'react';
import { AccountBrandCardList } from '@/components/group-monitoring/AccountBrandCardList';
import { AccountBrandTableView } from '@/components/group-monitoring/AccountBrandTableView';
import { AccountMonitoringSyncModals } from '@/components/group-monitoring/AccountMonitoringSyncModals';
import { RemoveAccountModal } from '@/components/group-monitoring/RemoveAccountModal';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';
import { useRemoveAccountFromSlot } from '@/hooks/useRemoveAccountFromSlot';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountViewMode } from '@/types/accountMonitoringUi';

interface AccountMonitoringBodyProps {
  viewMode: AccountViewMode;
}

export function AccountMonitoringBody({ viewMode }: AccountMonitoringBodyProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { canManageStructure, canOperatePlatform } = usePermissions();
  const {
    filteredGroups,
    onGroupsChange,
    loading,
    refreshIssues,
    setProbeSuspendAccountIds,
  } = useGroupMonitoring();

  const sync = useAccountSyncFlow({
    onGroupsChange,
    userId: user?.id ?? null,
    canOperatePlatform,
    translate: t,
    onTicketsReload: (dbAccountId) => refreshIssues(dbAccountId),
  });

  const removeSlot = useRemoveAccountFromSlot(onGroupsChange, user?.id, canManageStructure);

  const probeSuspendIds = useMemo(() => {
    const ids = new Set<string>();
    if (sync.processingAccountId) {
      ids.add(sync.processingAccountId);
    }
    if (sync.processingDbAccountId && sync.processingAccountId) {
      ids.add(sync.processingDbAccountId);
    }
    if (sync.step === 'scrape-prompt' && sync.target?.account.id) {
      ids.add(sync.target.account.id);
    }
    if (sync.step === 'platform-login' && sync.target?.account.id) {
      ids.add(sync.target.account.id);
    }
    if (sync.target?.dbAccountId) {
      ids.add(sync.target.dbAccountId);
    }
    if (sync.postLoginGraceAccountId) {
      ids.add(sync.postLoginGraceAccountId);
    }
    return [...ids];
  }, [
    sync.postLoginGraceAccountId,
    sync.processingAccountId,
    sync.processingDbAccountId,
    sync.step,
    sync.target?.account.id,
    sync.target?.dbAccountId,
  ]);

  useEffect(() => {
    setProbeSuspendAccountIds(probeSuspendIds);
  }, [probeSuspendIds, setProbeSuspendAccountIds]);

  const hasFilteredBrands = filteredGroups.length > 0;

  return (
    <>
      <AccountMonitoringSyncModals sync={sync} />

      {loading ? (
        <p className="account-sync-loading">{t('groupMonitoring.loadingAccounts')}</p>
      ) : null}

      {!loading && removeSlot.removeTarget ? (
        <RemoveAccountModal
          open
          accountName={removeSlot.removeTarget.account.accountName}
          platform={removeSlot.removeTarget.account.platform}
          brandName={removeSlot.removeTarget.account.brandName}
          saving={removeSlot.removeSaving}
          error={removeSlot.removeError}
          onClose={removeSlot.closeRemoveModal}
          onConfirm={() => void removeSlot.commitRemoveFromSlot()}
        />
      ) : null}

      {!loading &&
        (viewMode === 'table' ? (
          hasFilteredBrands ? (
            <AccountBrandTableView
              groups={filteredGroups}
              onGroupsChange={onGroupsChange}
              sync={sync}
              onRemoveFromSlot={removeSlot.openRemoveModal}
            />
          ) : (
            <div className="ticket-card-list ticket-card-list--empty account-filter-empty">
              <p className="ticket-empty-title">{t('groupMonitoring.noFilterMatch')}</p>
              <p className="ticket-empty-desc">{t('groupMonitoring.noFilterMatchDesc')}</p>
            </div>
          )
        ) : (
          <AccountBrandCardList
            groups={filteredGroups}
            onGroupsChange={onGroupsChange}
            sync={sync}
            onRemoveFromSlot={removeSlot.openRemoveModal}
          />
        ))}
    </>
  );
}
