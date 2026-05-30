import { Download } from 'lucide-react';
import { AccountTableRow } from '@/components/group-monitoring/AccountMonitoringCells';
import {
  AccountMonitoringTableColGroup,
  AccountMonitoringTableHead,
} from '@/components/group-monitoring/AccountMonitoringTableParts';
import { flattenBrandAccounts } from '@/lib/accountBrandUtils';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

interface AccountBrandTableViewProps {
  groups: AccountBrandGroup[];
}

export function AccountBrandTableView({ groups }: AccountBrandTableViewProps) {
  const { t } = useLanguage();
  const rows = flattenBrandAccounts(groups);

  return (
    <div className="account-table-view">
      <div className="account-table-view-scroll">
        <table className="brand-card-table">
          <AccountMonitoringTableColGroup />
          <AccountMonitoringTableHead />
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => <AccountTableRow key={row.id} row={row} />)
            ) : (
              <tr className="brand-card-empty-row">
                <td colSpan={6} className="brand-card-empty-slot">
                  {t('groupMonitoring.accountCard.emptySlot')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="account-table-view-footer">
        <button type="button" className="brand-card-export-btn">
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          {t('groupMonitoring.accountCard.export')}
        </button>
      </footer>
    </div>
  );
}
