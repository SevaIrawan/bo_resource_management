import { ChevronDown, ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ReportingTableShell } from '@/components/group-monitoring/ReportingTableShell';
import { useLanguage } from '@/hooks/useLanguage';
import { reportingAccountDisplayName } from '@/lib/reportingDisplayName';
import type {
  ReportingMatrixColumnFilter,
  ReportingMatrixColumnFilterValue,
} from '@/lib/reportingMatrixColumn';
import { cn } from '@/lib/utils';
import type { JoinGroupMatrixRow, ReportingAccountRef } from '@/lib/loadJoinGroupReport';

export type ReportingMatrixMode = 'join' | 'admin';

interface ReportingJoinMatrixTableProps {
  rows: JoinGroupMatrixRow[];
  accounts: ReportingAccountRef[];
  brandName: string;
  mode?: ReportingMatrixMode;
  pageOffset?: number;
  columnFilter: ReportingMatrixColumnFilter;
  onColumnFilterChange: (filter: ReportingMatrixColumnFilter) => void;
  groupNameSearch?: string;
  onClearGroupNameSearch?: () => void;
}

function AccountColumnHeader({
  accountId,
  label,
  columnFilter,
  onColumnFilterChange,
}: {
  accountId: string;
  label: string;
  columnFilter: ReportingMatrixColumnFilter;
  onColumnFilterChange: (filter: ReportingMatrixColumnFilter) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isActive = columnFilter?.accountId === accountId;
  const activeValue = isActive ? columnFilter.value : null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const apply = (value: ReportingMatrixColumnFilterValue | null) => {
    if (value === null) {
      onColumnFilterChange(null);
    } else {
      onColumnFilterChange({ accountId, value });
    }
    setOpen(false);
  };

  const options: { value: ReportingMatrixColumnFilterValue | null; label: string }[] = [
    { value: 'yes', label: t('groupMonitoring.reporting.joinYes') },
    { value: 'no', label: t('groupMonitoring.reporting.joinNo') },
    { value: null, label: t('groupMonitoring.reporting.matrixFilterAll') },
  ];

  return (
    <div className="join-report-table__account-header-wrap" ref={wrapRef}>
      <button
        type="button"
        className={cn(
          'join-report-table__account-filter-btn',
          isActive && 'join-report-table__account-filter-btn--active',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('groupMonitoring.reporting.matrixFilterColumn', { name: label })}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{label}</span>
        <ChevronDown
          className={cn('join-report-table__account-filter-icon', open && 'join-report-table__account-filter-icon--open')}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="join-report-table__account-filter-menu" role="menu">
          {options.map((opt) => (
            <li key={opt.label} role="presentation">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={activeValue === opt.value && (opt.value !== null || !isActive)}
                className={cn(
                  'join-report-table__account-filter-menu-item',
                  (opt.value === null && !isActive) || activeValue === opt.value
                    ? 'join-report-table__account-filter-menu-item--active'
                    : null,
                )}
                onClick={() => apply(opt.value)}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ReportingJoinMatrixTable({
  rows,
  accounts,
  brandName,
  mode = 'join',
  pageOffset = 0,
  columnFilter,
  onColumnFilterChange,
  groupNameSearch = '',
  onClearGroupNameSearch,
}: ReportingJoinMatrixTableProps) {
  const { t } = useLanguage();
  const columnCount = 4 + accounts.length;
  const hasGroupNameSearch = groupNameSearch.trim().length > 0;
  const showFilteredEmpty = rows.length === 0 && (columnFilter !== null || hasGroupNameSearch);

  if (rows.length === 0 && !showFilteredEmpty) {
    return (
      <p className="reporting-empty px-5 py-4 text-sm text-text-muted">
        {t('groupMonitoring.reporting.noMasterRows')}
      </p>
    );
  }

  return (
    <ReportingTableShell
      header={
        <tr>
          <th className="join-report-table__col-no">{t('groupMonitoring.reporting.colNo')}</th>
          <th>{t('groupMonitoring.reporting.colGroupName')}</th>
          <th>{t('groupMonitoring.reporting.colGroupId')}</th>
          <th>{t('groupMonitoring.reporting.colGroupLink')}</th>
          {accounts.map((acc) => (
            <th key={acc.id} className="join-report-table__account-col">
              <AccountColumnHeader
                accountId={acc.id}
                label={reportingAccountDisplayName(acc.accountName, brandName)}
                columnFilter={columnFilter}
                onColumnFilterChange={onColumnFilterChange}
              />
            </th>
          ))}
        </tr>
      }
    >
      {showFilteredEmpty ? (
        <tr className="join-report-table__filter-empty-row">
          <td colSpan={columnCount}>
            <div className="join-report-table__filter-empty">
              <p className="join-report-table__filter-empty-text">
                {columnFilter
                  ? t('groupMonitoring.reporting.matrixFilterEmpty')
                  : t('groupMonitoring.reporting.matrixSearchEmpty')}
              </p>
              {columnFilter ? (
                <button
                  type="button"
                  className="join-report-table__filter-empty-btn"
                  onClick={() => onColumnFilterChange(null)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  {t('groupMonitoring.reporting.matrixFilterClear')}
                </button>
              ) : null}
              {hasGroupNameSearch && onClearGroupNameSearch ? (
                <button
                  type="button"
                  className="join-report-table__filter-empty-btn"
                  onClick={onClearGroupNameSearch}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  {t('groupMonitoring.reporting.matrixSearchClear')}
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
      {rows.map((row, index) => (
        <tr key={row.groupId}>
          <td className="join-report-table__col-no tabular-nums">{pageOffset + index + 1}</td>
          <td>{row.groupName}</td>
          <td className="join-report-table__mono">{row.groupId}</td>
          <td>
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
          {accounts.map((acc) => {
            const active =
              mode === 'admin' ? row.adminByAccountId[acc.id] : row.joinByAccountId[acc.id];
            const isFilterColumn = columnFilter?.accountId === acc.id;

            return (
              <td
                key={acc.id}
                className={cn(
                  active ? 'join-report-table__yes' : 'join-report-table__no',
                  isFilterColumn && 'join-report-table__account-col--filtered',
                )}
              >
                {active
                  ? t('groupMonitoring.reporting.joinYes')
                  : t('groupMonitoring.reporting.joinNo')}
              </td>
            );
          })}
        </tr>
      ))}
    </ReportingTableShell>
  );
}
