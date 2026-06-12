import { ReportingTableShell } from '@/components/group-monitoring/ReportingTableShell';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountGroupLinkRow } from '@/lib/accountGroupLinks';

interface ReportingAdminDailyTableProps {
  rows: AccountGroupLinkRow[];
  pageOffset?: number;
}

export function ReportingAdminDailyTable({
  rows,
  pageOffset = 0,
}: ReportingAdminDailyTableProps) {
  const { t } = useLanguage();

  if (rows.length === 0) {
    return (
      <p className="reporting-empty text-sm text-text-muted">
        {t('groupMonitoring.reporting.noMasterRows')}
      </p>
    );
  }

  return (
    <ReportingTableShell
      tableClassName="join-report-table--daily-admin"
      header={
        <tr>
          <th className="join-report-table__col-no">{t('groupMonitoring.reporting.colNo')}</th>
          <th>{t('groupMonitoring.reporting.colGroupName')}</th>
          <th>{t('groupMonitoring.reporting.colGroupId')}</th>
          <th className="join-report-table__col-link">{t('groupMonitoring.reporting.colGroupLink')}</th>
          <th className="join-report-table__col-center">
            {t('groupMonitoring.reporting.colIsAdmin')}
          </th>
        </tr>
      }
    >
      {rows.map((row, index) => (
        <tr key={row.groupId}>
          <td className="join-report-table__col-no tabular-nums">{pageOffset + index + 1}</td>
          <td>{row.groupName}</td>
          <td className="join-report-table__mono">{row.groupId}</td>
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
          <td className={row.isAdmin === 'yes' ? 'join-report-table__yes' : 'join-report-table__no'}>
            {row.isAdmin === 'yes'
              ? t('groupMonitoring.reporting.joinYes')
              : t('groupMonitoring.reporting.joinNo')}
          </td>
        </tr>
      ))}
    </ReportingTableShell>
  );
}
