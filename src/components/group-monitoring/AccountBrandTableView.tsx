import { Download } from 'lucide-react';
import { AccountTableRow } from '@/components/group-monitoring/AccountMonitoringCells';
import {
  ACCOUNT_TABLE_COLUMN_COUNT,
  AccountMonitoringTableColGroup,
  AccountMonitoringTableHead,
} from '@/components/group-monitoring/AccountMonitoringTableParts';
import { flattenBrandAccounts } from '@/lib/accountBrandUtils';
import { exportAllAccountsExcel } from '@/lib/exportExcel';
import { useLanguage } from '@/hooks/useLanguage';
import type { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

type SyncFlow = ReturnType<typeof useAccountSyncFlow>;

interface AccountBrandTableViewProps {
  groups: AccountBrandGroup[];
  sync: SyncFlow;
}

export function AccountBrandTableView({ groups, sync }: AccountBrandTableViewProps) {
  const { t } = useLanguage();
  const rows = flattenBrandAccounts(groups);
  const { processingAccountId, processingAction, handleSyncAccount, handleRunScraper } = sync;

  function handleSyncRow(accountId: string) {
    const group = groups.find((item) => item.accounts.some((row) => row.id === accountId));
    const account = group?.accounts.find((row) => row.id === accountId);
    if (!group || !account) return;
    handleSyncAccount(group.id, account);
  }

  function handleScraperRow(accountId: string) {
    const group = groups.find((item) => item.accounts.some((row) => row.id === accountId));
    const account = group?.accounts.find((row) => row.id === accountId);
    if (!group || !account) return;
    void handleRunScraper(group.id, account);
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
                  onSync={() => handleSyncRow(row.id)}
                  onRunScraper={() => handleScraperRow(row.id)}
                  syncLoading={
                    processingAction === 'sync' && processingAccountId === row.id
                  }
                  scraperLoading={
                    processingAction === 'scraper' && processingAccountId === row.id
                  }
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

      <footer className="account-table-view-footer">
        <button
          type="button"
          className="brand-card-export-btn"
          disabled={rows.length === 0}
          onClick={() => exportAllAccountsExcel(groups)}
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          {t('groupMonitoring.accountCard.export')}
        </button>
      </footer>
    </div>
  );
}
