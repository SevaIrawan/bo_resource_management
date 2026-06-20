import { ReportingTableShell } from '@/components/group-monitoring/ReportingTableShell';
import { ReportingStockStatusCell } from '@/components/group-monitoring/ReportingStockStatusCell';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountGroupLinkRow } from '@/lib/accountGroupLinks';

interface ReportingDailyTableProps {
  rows: AccountGroupLinkRow[];
  pageOffset?: number;
}

export function ReportingDailyTable({ rows, pageOffset = 0 }: ReportingDailyTableProps) {
  const { t } = useLanguage();

  if (rows.length === 0) {
    return (
      <p className="reporting-empty text-sm text-text-muted">
        {t('groupMonitoring.reporting.noDailyRows')}
      </p>
    );
  }

  return (
    <ReportingTableShell
      tableClassName="join-report-table--daily-group"
      header={
        <tr>
          <th className="join-report-table__col-no">{t('groupMonitoring.reporting.colNo')}</th>
          <th>{t('groupMonitoring.reporting.colGroupName')}</th>
          <th>{t('groupMonitoring.reporting.colGroupId')}</th>
          <th className="join-report-table__col-center">
            {t('groupMonitoring.reporting.colMemberCount')}
          </th>
          <th className="join-report-table__col-center">
            {t('groupMonitoring.reporting.colAdminCount')}
          </th>
          <th className="join-report-table__col-center">
            {t('groupMonitoring.reporting.colIsAdmin')}
          </th>
          <th className="join-report-table__col-link">{t('groupMonitoring.reporting.colGroupLink')}</th>
          <th>{t('groupMonitoring.reporting.colStatus')}</th>
        </tr>
      }
    >
      {rows.map((row, index) => (
        <tr key={row.groupId}>
          <td className="join-report-table__col-no tabular-nums">{pageOffset + index + 1}</td>
          <td>{row.groupName}</td>
          <td className="join-report-table__mono">{row.groupId}</td>
          <td className="join-report-table__col-center tabular-nums">{row.memberCount}</td>
          <td className="join-report-table__col-center tabular-nums">{row.adminCount}</td>
          <td
            className={
              row.isAdmin === 'yes' ? 'join-report-table__yes' : 'join-report-table__no'
            }
          >
            {row.isAdmin === 'yes'
              ? t('groupMonitoring.reporting.joinYes')
              : t('groupMonitoring.reporting.joinNo')}
          </td>
          <td className="join-report-table__col-link">
            {row.inviteLink ? (
              <a
                href={row.inviteLink}
                target="_blank"
                rel="noopener noreferrer"
                className="join-report-table__link"
              >
                {row.inviteLink}
              </a>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </td>
          <td>
            <ReportingStockStatusCell status={row.stockStatus ?? 'other'} />
          </td>
        </tr>
      ))}
    </ReportingTableShell>
  );
}
