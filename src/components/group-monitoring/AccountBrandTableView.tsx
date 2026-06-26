import { useState, type Dispatch, type SetStateAction } from 'react';
import { AccountTableRow } from '@/components/group-monitoring/AccountMonitoringCells';
import {
  EditAccountModal,
  type EditAccountFormValues,
} from '@/components/group-monitoring/EditAccountModal';
import {
  ACCOUNT_TABLE_COLUMN_COUNT,
  AccountMonitoringTableColGroup,
  AccountMonitoringTableHead,
} from '@/components/group-monitoring/AccountMonitoringTableParts';
import { flattenBrandAccounts, patchAccountDetailsInGroups } from '@/lib/accountBrandUtils';
import { commitAccountDetailsEdit } from '@/lib/commitAccountDetailsEdit';
import { resolveMessagingAccountSaveErrorCode } from '@/lib/messagingAccounts';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { usePermissions } from '@/hooks/usePermissions';
import type { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';

type SyncFlow = ReturnType<typeof useAccountSyncFlow>;

interface AccountBrandTableViewProps {
  groups: AccountBrandGroup[];
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  sync: SyncFlow;
  onRemoveFromSlot: (groupId: string, account: AccountBrandRow) => void;
}

export function AccountBrandTableView({
  groups,
  onGroupsChange,
  sync,
  onRemoveFromSlot,
}: AccountBrandTableViewProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { canManageStructure, canOperatePlatform } = usePermissions();
  const [editTarget, setEditTarget] = useState<{
    groupId: string;
    account: AccountBrandRow;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const rows = flattenBrandAccounts(groups);
  const {
    processingByAccount,
    clearingSessionAccountId,
    handleSyncAccount,
    handleClearSession,
    handleRunScraper,
    requestCancelScrape,
    getScrapeProgress,
  } = sync;

  function handleSyncRow(accountId: string) {
    if (!canOperatePlatform) return;
    const group = groups.find((item) => item.accounts.some((row) => row.id === accountId));
    const account = group?.accounts.find((row) => row.id === accountId);
    if (!group || !account) return;
    handleSyncAccount(group.id, account);
  }

  function handleScraperRow(accountId: string) {
    if (!canOperatePlatform) return;
    const group = groups.find((item) => item.accounts.some((row) => row.id === accountId));
    const account = group?.accounts.find((row) => row.id === accountId);
    if (!group || !account) return;
    void handleRunScraper(group.id, account);
  }

  function handleClearSessionRow(accountId: string) {
    if (!canOperatePlatform) return;
    const group = groups.find((item) => item.accounts.some((row) => row.id === accountId));
    const account = group?.accounts.find((row) => row.id === accountId);
    if (!group || !account) return;
    void handleClearSession(group.id, account);
  }

  function handleRemoveRow(accountId: string) {
    if (!canManageStructure) return;
    const group = groups.find((item) => item.accounts.some((row) => row.id === accountId));
    const account = group?.accounts.find((row) => row.id === accountId);
    if (!group || !account) return;
    onRemoveFromSlot(group.id, account);
  }

  function handleEditRow(accountId: string) {
    if (!canManageStructure) return;
    const group = groups.find((item) => item.accounts.some((row) => row.id === accountId));
    const account = group?.accounts.find((row) => row.id === accountId);
    if (!group || !account) return;
    setEditError(null);
    setEditTarget({ groupId: group.id, account });
  }

  function closeEditModal() {
    if (editSaving) return;
    setEditTarget(null);
    setEditError(null);
  }

  async function handleSaveEdit(values: EditAccountFormValues) {
    if (!canManageStructure || !editTarget) return;

    const { groupId, account } = editTarget;
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;

    setEditSaving(true);
    setEditError(null);

    try {
      const normalized = await commitAccountDetailsEdit({
        userId: user?.id,
        brandName: group.brandName,
        account,
        values,
      });

      onGroupsChange((prev) => patchAccountDetailsInGroups(prev, groupId, account.id, normalized));
      setEditTarget(null);
      setEditError(null);
    } catch (error) {
      const code = resolveMessagingAccountSaveErrorCode(error);
      setEditError(
        code === 'SUPABASE_NOT_CONFIGURED'
          ? t('login.supabaseNotConfigured')
          : code === 'ACCOUNT_LABEL_IN_USE'
            ? t('groupMonitoring.accountCard.accountLabelInUse')
            : t('groupMonitoring.accountCard.saveAccountFailed'),
      );
    } finally {
      setEditSaving(false);
    }
  }

  function handleCancelScrapeRow(accountId: string) {
    if (!canOperatePlatform) return;
    const group = groups.find((item) => item.accounts.some((row) => row.id === accountId));
    const account = group?.accounts.find((row) => row.id === accountId);
    if (!group || !account) return;
    requestCancelScrape(group.id, account);
  }

  return (
    <div className="account-table-view">
      <div className="account-table-view-scroll">
        <table className="brand-card-table">
          <AccountMonitoringTableColGroup />
          <AccountMonitoringTableHead />
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <AccountTableRow
                  key={row.id}
                  row={row}
                  canOperatePlatform={canOperatePlatform}
                  canManageStructure={canManageStructure}
                  onSync={() => handleSyncRow(row.id)}
                  onRunScraper={() => handleScraperRow(row.id)}
                  onCancelScrape={() => handleCancelScrapeRow(row.id)}
                  syncLoading={processingByAccount[row.id] === 'sync'}
                  scraperLoading={processingByAccount[row.id] === 'scraper'}
                  scrapeProgress={getScrapeProgress(row.id)}
                  onRemoveFromSlot={() => handleRemoveRow(row.id)}
                  onEditAccount={() => handleEditRow(row.id)}
                  onClearSession={() => handleClearSessionRow(row.id)}
                  clearSessionLoading={clearingSessionAccountId === row.id}
                />
              ))
            ) : (
              <tr className="brand-card-empty-row">
                <td colSpan={ACCOUNT_TABLE_COLUMN_COUNT} className="brand-card-empty-slot">
                  {t('groupMonitoring.accountCard.emptySlot')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditAccountModal
        open={editTarget != null}
        account={editTarget?.account ?? null}
        brandName={editTarget?.account.brandName ?? ''}
        saving={editSaving}
        error={editError}
        onClose={closeEditModal}
        onSubmit={(values) => void handleSaveEdit(values)}
      />
    </div>
  );
}
