import { AccountTableRow } from '@/components/group-monitoring/AccountMonitoringCells';
import {
  ACCOUNT_TABLE_COLUMN_COUNT,
  AccountMonitoringTableColGroup,
  AccountMonitoringTableHead,
} from '@/components/group-monitoring/AccountMonitoringTableParts';
import { flattenBrandAccounts } from '@/lib/accountBrandUtils';
import { useLanguage } from '@/hooks/useLanguage';
import { usePermissions } from '@/hooks/usePermissions';
import type { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';

type SyncFlow = ReturnType<typeof useAccountSyncFlow>;

interface AccountBrandTableViewProps {
  groups: AccountBrandGroup[];
  sync: SyncFlow;
  onRemoveFromSlot: (groupId: string, account: AccountBrandRow) => void;
}

export function AccountBrandTableView({ groups, sync, onRemoveFromSlot }: AccountBrandTableViewProps) {
  const { t } = useLanguage();
  const { canManageStructure, canOperatePlatform } = usePermissions();
  const rows = flattenBrandAccounts(groups);
  const {
    processingAccountId,
    processingAction,
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
                  syncLoading={
                    processingAction === 'sync' && processingAccountId === row.id
                  }
                  scraperLoading={
                    processingAction === 'scraper' && processingAccountId === row.id
                  }
                  scrapeProgress={getScrapeProgress(row.id)}
                  onRemoveFromSlot={() => handleRemoveRow(row.id)}
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
    </div>
  );
}
