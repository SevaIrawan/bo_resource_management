import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountBrandCardList } from '@/components/group-monitoring/AccountBrandCardList';
import { AccountBrandTableView } from '@/components/group-monitoring/AccountBrandTableView';
import { AccountMonitoringSyncModals } from '@/components/group-monitoring/AccountMonitoringSyncModals';
import { AddBrandModal } from '@/components/group-monitoring/AddBrandModal';
import { RemoveAccountModal } from '@/components/group-monitoring/RemoveAccountModal';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';
import { useRemoveAccountFromSlot } from '@/hooks/useRemoveAccountFromSlot';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';
import { appendBrandGroupFromName } from '@/lib/accountBrandUtils';
import type { AccountViewMode } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

interface AccountMonitoringBodyProps {
  viewMode: AccountViewMode;
  quickAddBrandNonce?: number;
}

export function AccountMonitoringBody({
  viewMode,
  quickAddBrandNonce = 0,
}: AccountMonitoringBodyProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { canManageStructure, canOperatePlatform } = usePermissions();
  const {
    filteredGroups,
    onGroupsChange,
    loading,
    setProbeSuspendAccountIds,
    accountFilters,
  } = useGroupMonitoring();

  const sync = useAccountSyncFlow({
    onGroupsChange,
    userId: user?.id ?? null,
    canOperatePlatform,
    translate: t,
  });

  const removeSlot = useRemoveAccountFromSlot(onGroupsChange, user?.id, canManageStructure);
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const lastQuickAddNonce = useRef(0);

  useEffect(() => {
    if (
      quickAddBrandNonce > lastQuickAddNonce.current &&
      canManageStructure &&
      viewMode === 'table'
    ) {
      setQuickAddModalOpen(true);
    }
    lastQuickAddNonce.current = quickAddBrandNonce;
  }, [quickAddBrandNonce, canManageStructure, viewMode]);

  async function handleQuickAddBrand(brandName: string) {
    if (!canManageStructure) return;
    await appendBrandGroupFromName(brandName, user?.id, onGroupsChange);
  }

  const probeSuspendIds = useMemo(() => {
    const ids = new Set<string>();
    for (const accountId of Object.keys(sync.processingByAccount)) {
      ids.add(accountId);
      const dbId = sync.processingDbByAccount[accountId];
      if (dbId) ids.add(dbId);
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
    sync.processingByAccount,
    sync.processingDbByAccount,
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

      {!loading && viewMode === 'table' && canManageStructure ? (
        <AddBrandModal
          open={quickAddModalOpen}
          onClose={() => setQuickAddModalOpen(false)}
          onSubmit={handleQuickAddBrand}
        />
      ) : null}

      {!loading &&
        (viewMode === 'table' ? (
          hasFilteredBrands ? (
            <AccountBrandTableView groups={filteredGroups} />
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
            activePlatformFilter={
              accountFilters.platform === 'all'
                ? 'all'
                : (accountFilters.platform as Platform)
            }
            quickAddBrandNonce={quickAddBrandNonce}
          />
        ))}
    </>
  );
}
