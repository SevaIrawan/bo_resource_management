import { AccountTableRow } from '@/components/group-monitoring/AccountMonitoringCells';
import {
  ACCOUNT_TABLE_COLUMN_COUNT,
  AccountMonitoringTableColGroup,
  AccountMonitoringTableHead,
} from '@/components/group-monitoring/AccountMonitoringTableParts';
import { flattenBrandAccounts } from '@/lib/accountBrandUtils';
import { useLanguage } from '@/hooks/useLanguage';
import { usePermissions } from '@/hooks/usePermissions';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

interface AccountBrandTableViewProps {
  groups: AccountBrandGroup[];
}

/** Table view — satu tabel flat semua brand; read-only kolom Account/Session, tanpa Last update. */
export function AccountBrandTableView({ groups }: AccountBrandTableViewProps) {
  const { t } = useLanguage();
  const { canOperatePlatform } = usePermissions();
  const rows = flattenBrandAccounts(groups);

  return (
    <div className="account-table-view">
      <div className="account-table-view-scroll">
        <table className="brand-card-table brand-card-table--flat">
          <AccountMonitoringTableColGroup layout="flat" />
          <AccountMonitoringTableHead layout="flat" />
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <AccountTableRow
                  key={row.id}
                  row={row}
                  layout="flat"
                  brandAccounts={groups.find((g) => g.brandName === row.brandName)?.accounts}
                  canOperatePlatform={canOperatePlatform}
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
