import { AccountBrandCardList } from '@/components/group-monitoring/AccountBrandCardList';
import { AccountBrandTableView } from '@/components/group-monitoring/AccountBrandTableView';
import { AddBrandModal } from '@/components/group-monitoring/AddBrandModal';
import { RemoveAccountModal } from '@/components/group-monitoring/RemoveAccountModal';
import { useAuth } from '@/hooks/useAuth';
import { useAccountSyncFlowContext } from '@/hooks/useAccountSyncFlowContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useRemoveAccountFromSlot } from '@/hooks/useRemoveAccountFromSlot';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';
import { appendBrandGroupFromName } from '@/lib/accountBrandUtils';
import type { AccountViewMode } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

interface AccountMonitoringBodyProps {
  viewMode: AccountViewMode;
  addBrandModalOpen: boolean;
  onAddBrandModalOpenChange: (open: boolean) => void;
}

export function AccountMonitoringBody({
  viewMode,
  addBrandModalOpen,
  onAddBrandModalOpenChange,
}: AccountMonitoringBodyProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { canManageStructure } = usePermissions();
  const { filteredGroups, onGroupsChange, loading, accountFilters } = useGroupMonitoring();
  const sync = useAccountSyncFlowContext();

  const removeSlot = useRemoveAccountFromSlot(onGroupsChange, user?.id, canManageStructure);

  function openAddBrandModal() {
    if (!canManageStructure) return;
    onAddBrandModalOpenChange(true);
  }

  async function handleAddBrand(brandName: string) {
    if (!canManageStructure) return;
    await appendBrandGroupFromName(brandName, user?.id, onGroupsChange);
  }

  const hasFilteredBrands = filteredGroups.length > 0;

  return (
    <>
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

      {!loading && canManageStructure ? (
        <AddBrandModal
          open={addBrandModalOpen}
          onClose={() => onAddBrandModalOpenChange(false)}
          onSubmit={handleAddBrand}
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
            onOpenAddBrand={openAddBrandModal}
            activePlatformFilter={
              accountFilters.platform === 'all'
                ? 'all'
                : (accountFilters.platform as Platform)
            }
          />
        ))}
    </>
  );
}
