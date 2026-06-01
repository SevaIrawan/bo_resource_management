import { useEffect, useMemo } from 'react';
import { AccountBrandCardList } from '@/components/group-monitoring/AccountBrandCardList';
import { AccountBrandTableView } from '@/components/group-monitoring/AccountBrandTableView';
import { AccountMonitoringSyncModals } from '@/components/group-monitoring/AccountMonitoringSyncModals';
import { RemoveAccountModal } from '@/components/group-monitoring/RemoveAccountModal';
import { useAuth } from '@/hooks/useAuth';
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
  const {
    groups,
    filteredGroups,
    onGroupsChange,
    loading,
    reloadTickets,
    setProbeSuspendAccountIds,
  } = useGroupMonitoring();

  const sync = useAccountSyncFlow({
    onGroupsChange,
    userId: user?.id ?? null,
    onTicketsReload: () => {
      void reloadTickets();
    },
  });

  const removeSlot = useRemoveAccountFromSlot(groups, onGroupsChange, user?.id);

  const probeSuspendIds = useMemo(() => {
    const ids = new Set<string>();
    if (sync.processingAccountId) {
      ids.add(sync.processingAccountId);
    }
    if (sync.processingDbAccountId && sync.processingAccountId) {
      ids.add(sync.processingDbAccountId);
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

  if (loading) {
    return <p className="account-sync-loading">{t('groupMonitoring.loadingAccounts')}</p>;
  }

  const hasAnyAccounts = groups.some((g) => g.accounts.length > 0);
  const hasFiltered = filteredGroups.some((g) => g.accounts.length > 0);

  return (
    <>
      <AccountMonitoringSyncModals sync={sync} />

      {removeSlot.removeTarget ? (
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

      {hasFiltered ? (
        viewMode === 'table' ? (
          <AccountBrandTableView
            groups={filteredGroups}
            sync={sync}
            onRemoveFromSlot={removeSlot.openRemoveModal}
          />
        ) : (
          <AccountBrandCardList
            groups={filteredGroups}
            onGroupsChange={onGroupsChange}
            sync={sync}
            onRemoveFromSlot={removeSlot.openRemoveModal}
          />
        )
      ) : (
        <div className="ticket-card-list ticket-card-list--empty account-filter-empty">
          <p className="ticket-empty-title">
            {hasAnyAccounts
              ? t('groupMonitoring.noFilterMatch')
              : t('groupMonitoring.noAccounts')}
          </p>
          <p className="ticket-empty-desc">
            {hasAnyAccounts
              ? t('groupMonitoring.noFilterMatchDesc')
              : t('groupMonitoring.noAccountsDesc')}
          </p>
        </div>
      )}
    </>
  );
}
