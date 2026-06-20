import { useCallback, useEffect, useMemo, useState } from 'react';
import { ContentNestedPanel } from '@/components/group-monitoring/ContentAreaCard';
import { ReportingAdminDailyTable } from '@/components/group-monitoring/ReportingAdminDailyTable';
import {
  ReportingCardFooter,
  sliceReportingPage,
} from '@/components/group-monitoring/ReportingCardFooter';
import { ReportingDailyTable } from '@/components/group-monitoring/ReportingDailyTable';
import { ReportingJoinMatrixTable } from '@/components/group-monitoring/ReportingJoinMatrixTable';
import {
  defaultReportingFilters,
  normalizeReportingFilters,
  REPORTING_ACCOUNT_ALL,
  ReportingSlicerHeader,
  type ReportingFilters,
} from '@/components/group-monitoring/ReportingSlicerHeader';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';
import { useMonitoringTab } from '@/hooks/useMonitoringTab';
import { fetchAccountGroupLinks, type AccountGroupLinkRow } from '@/lib/accountGroupLinks';
import { getErrorMessage } from '@/lib/errorMessage';
import {
  exportReportingAdminDailyExcel,
  exportReportingDailyExcel,
  exportReportingMatrixExcel,
  type ReportingExportMeta,
} from '@/lib/exportExcel';
import { reportingAccountDisplayName } from '@/lib/reportingDisplayName';
import {
  loadAccountDailyReport,
  loadJoinGroupMatrix,
  type JoinGroupMatrixRow,
  type ReportingAccountRef,
} from '@/lib/loadJoinGroupReport';
import { filterReportingRowsByGroupName } from '@/lib/filterReportingGroupName';
import { filterReportingRowsByStockStatus } from '@/lib/filterReportingStockStatus';
import {
  filterReportingMatrixRows,
  type ReportingMatrixColumnFilter,
} from '@/lib/reportingMatrixColumn';

export function ReportingMonitoringPanel() {
  const { t } = useLanguage();
  const { groups, loading } = useGroupMonitoring();
  const { tab } = useMonitoringTab();

  const [filters, setFilters] = useState<ReportingFilters>(() => defaultReportingFilters(groups));
  const [matrixRows, setMatrixRows] = useState<JoinGroupMatrixRow[]>([]);
  const [dailyRows, setDailyRows] = useState<AccountGroupLinkRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [page, setPage] = useState(1);
  const [matrixColumnFilter, setMatrixColumnFilter] = useState<ReportingMatrixColumnFilter>(null);

  useEffect(() => {
    if (groups.length === 0) return;
    setFilters((prev) =>
      normalizeReportingFilters(groups, prev.brandName ? prev : defaultReportingFilters(groups)),
    );
  }, [groups]);

  const brandGroup = useMemo(
    () => groups.find((g) => g.brandName === filters.brandName),
    [groups, filters.brandName],
  );

  const matrixAccounts: ReportingAccountRef[] = useMemo(() => {
    if (!brandGroup) return [];
    return brandGroup.accounts
      .filter((a) => a.platform === filters.platform)
      .map((a) => ({ id: a.id, accountName: a.accountName }))
      .sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [brandGroup, filters.platform]);

  const selectedAccountName = useMemo(() => {
    if (filters.accountId === REPORTING_ACCOUNT_ALL) return null;
    return brandGroup?.accounts.find((a) => a.id === filters.accountId)?.accountName ?? null;
  }, [brandGroup, filters.accountId]);

  const isMatrix = filters.accountId === REPORTING_ACCOUNT_ALL;
  const isAdminBookmark = filters.bookmark === 'full_admin';

  const loadReport = useCallback(async () => {
    if (!filters.brandName || matrixAccounts.length === 0) {
      setMatrixRows([]);
      setDailyRows([]);
      return;
    }

    setReportLoading(true);
    setReportError(null);

    try {
      if (isMatrix) {
        const rows = await loadJoinGroupMatrix({
          brandName: filters.brandName,
          platform: filters.platform,
          accounts: matrixAccounts,
        });
        setMatrixRows(rows);
        setDailyRows([]);
      } else if (isAdminBookmark) {
        const rows = await fetchAccountGroupLinks(
          filters.brandName,
          filters.platform,
          filters.accountId,
        );
        setDailyRows(rows);
        setMatrixRows([]);
      } else {
        const rows = await loadAccountDailyReport(
          filters.accountId,
          filters.brandName,
          filters.platform,
        );
        setDailyRows(rows);
        setMatrixRows([]);
      }
    } catch (error) {
      setReportError(getErrorMessage(error, t('groupMonitoring.reporting.loadFailed')));
      setMatrixRows([]);
      setDailyRows([]);
    } finally {
      setReportLoading(false);
    }
  }, [filters, isAdminBookmark, isMatrix, matrixAccounts, t]);

  useEffect(() => {
    if (tab !== 'reporting' || loading) return;
    void loadReport();
  }, [tab, loading, loadReport, reloadTick]);

  useEffect(() => {
    const onRefresh = () => setReloadTick((n) => n + 1);
    window.addEventListener('rm-reporting-reload', onRefresh);
    return () => window.removeEventListener('rm-reporting-reload', onRefresh);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [
    filters.brandName,
    filters.platform,
    filters.accountId,
    filters.bookmark,
    filters.groupNameSearch,
    filters.stockStatus,
    reloadTick,
    matrixColumnFilter,
  ]);

  useEffect(() => {
    setMatrixColumnFilter(null);
  }, [filters.brandName, filters.platform, filters.accountId, filters.bookmark]);

  const searchedMatrixRows = useMemo(
    () => filterReportingRowsByGroupName(matrixRows, filters.groupNameSearch),
    [matrixRows, filters.groupNameSearch],
  );

  const statusFilteredMatrixRows = useMemo(
    () => filterReportingRowsByStockStatus(searchedMatrixRows, filters.stockStatus),
    [filters.stockStatus, searchedMatrixRows],
  );

  const searchedDailyRows = useMemo(
    () => filterReportingRowsByGroupName(dailyRows, filters.groupNameSearch),
    [dailyRows, filters.groupNameSearch],
  );

  const statusFilteredDailyRows = useMemo(
    () => filterReportingRowsByStockStatus(searchedDailyRows, filters.stockStatus),
    [filters.stockStatus, searchedDailyRows],
  );

  const filteredMatrixRows = useMemo(
    () =>
      filterReportingMatrixRows(
        statusFilteredMatrixRows,
        matrixColumnFilter,
        isAdminBookmark ? 'admin' : 'join',
      ),
    [isAdminBookmark, matrixColumnFilter, statusFilteredMatrixRows],
  );

  const matrixPage = sliceReportingPage(filteredMatrixRows, page);

  const patchFilters = (patch: Partial<ReportingFilters>) => {
    setFilters((prev) => normalizeReportingFilters(groups, { ...prev, ...patch }));
  };

  const dailyPage = sliceReportingPage(statusFilteredDailyRows, page);

  const exportMeta = useMemo((): ReportingExportMeta => {
    const accountDisplayName =
      filters.accountId !== REPORTING_ACCOUNT_ALL && selectedAccountName
        ? reportingAccountDisplayName(selectedAccountName, filters.brandName)
        : undefined;

    return {
      brandName: filters.brandName,
      platform: filters.platform,
      bookmark: filters.bookmark,
      accountScope: isMatrix ? 'all' : 'single',
      accountDisplayName,
    };
  }, [
    filters.accountId,
    filters.brandName,
    filters.bookmark,
    filters.platform,
    isMatrix,
    selectedAccountName,
  ]);

  const handleExport = () => {
    if (isMatrix) {
      if (filteredMatrixRows.length === 0) return;
      exportReportingMatrixExcel({
        meta: exportMeta,
        accounts: matrixAccounts,
        rows: filteredMatrixRows,
      });
      return;
    }

    if (searchedDailyRows.length === 0) return;

    if (isAdminBookmark) {
      exportReportingAdminDailyExcel({ meta: exportMeta, rows: statusFilteredDailyRows });
      return;
    }

    exportReportingDailyExcel({ meta: exportMeta, rows: statusFilteredDailyRows });
  };

  const showMatrixFooter =
    !loading && !reportLoading && !reportError && isMatrix && matrixRows.length > 0;
  const showDailyFooter =
    !loading && !reportLoading && !reportError && !isMatrix && dailyRows.length > 0;

  return (
    <section className="content-area-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
      <header className="content-area-header content-area-header--reporting shrink-0">
        <div
          className="content-slicer-bar reporting-slicer-bar px-5 py-3"
          data-slicer="reporting"
          aria-label={t('groupMonitoring.reporting.filtersAria')}
        >
          <ReportingSlicerHeader groups={groups} filters={filters} onChange={patchFilters} />
        </div>
      </header>

      <div className="content-area-body flex min-h-0 flex-1 flex-col overflow-hidden">
        <ContentNestedPanel className="reporting-nested-panel flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          {loading ? (
            <p className="account-sync-loading px-5 py-4">
              {t('groupMonitoring.loadingAccounts')}
            </p>
          ) : groups.length === 0 ? (
            <p className="reporting-empty px-5 py-4 text-sm text-text-muted">
              {t('groupMonitoring.reporting.noBrands')}
            </p>
          ) : matrixAccounts.length === 0 && filters.brandName ? (
            <p className="reporting-empty px-5 py-4 text-sm text-text-muted">
              {t('groupMonitoring.reporting.noAccountsForPlatform')}
            </p>
          ) : reportLoading ? (
            <p className="account-sync-loading px-5 py-4">
              {t('groupMonitoring.reporting.loadingReport')}
            </p>
          ) : reportError ? (
            <p className="px-5 py-4 text-sm text-destructive">{reportError}</p>
          ) : isMatrix ? (
            matrixRows.length === 0 ? (
              <p className="reporting-empty px-5 py-4 text-sm text-text-muted">
                {t('groupMonitoring.reporting.noMasterRows')}
              </p>
            ) : (
              <div className="reporting-table-panel">
                <ReportingJoinMatrixTable
                  rows={matrixPage.pageRows}
                  accounts={matrixAccounts}
                  brandName={filters.brandName}
                  mode={isAdminBookmark ? 'admin' : 'join'}
                  pageOffset={matrixPage.pageOffset}
                  columnFilter={matrixColumnFilter}
                  onColumnFilterChange={setMatrixColumnFilter}
                  groupNameSearch={filters.groupNameSearch}
                  onClearGroupNameSearch={() => patchFilters({ groupNameSearch: '' })}
                  stockStatusFilter={filters.stockStatus}
                  onClearStockStatusFilter={() => patchFilters({ stockStatus: 'all' })}
                />
                {showMatrixFooter ? (
                  <ReportingCardFooter
                    totalRows={filteredMatrixRows.length}
                    page={page}
                    onPageChange={setPage}
                    onExport={handleExport}
                  />
                ) : null}
              </div>
            )
          ) : dailyRows.length === 0 ? (
            <p className="reporting-empty px-5 py-4 text-sm text-text-muted">
              {isAdminBookmark
                ? t('groupMonitoring.reporting.noMasterRows')
                : t('groupMonitoring.reporting.noDailyRows')}
            </p>
          ) : statusFilteredDailyRows.length === 0 ? (
            <div className="reporting-table-panel">
              <p className="reporting-empty px-5 py-4 text-sm text-text-muted">
                {t('groupMonitoring.reporting.statusFilterEmpty')}
              </p>
              <div className="px-5 pb-4">
                <button
                  type="button"
                  className="join-report-table__filter-empty-btn"
                  onClick={() => patchFilters({ stockStatus: 'all' })}
                >
                  {t('groupMonitoring.reporting.statusFilterClear')}
                </button>
              </div>
            </div>
          ) : (
            <div className="reporting-table-panel">
              {isAdminBookmark ? (
                <ReportingAdminDailyTable
                  rows={dailyPage.pageRows}
                  pageOffset={dailyPage.pageOffset}
                />
              ) : (
                <ReportingDailyTable rows={dailyPage.pageRows} pageOffset={dailyPage.pageOffset} />
              )}
              {showDailyFooter ? (
                <ReportingCardFooter
                  totalRows={statusFilteredDailyRows.length}
                  page={page}
                  onPageChange={setPage}
                  onExport={handleExport}
                />
              ) : null}
            </div>
          )}
        </ContentNestedPanel>
      </div>
    </section>
  );
}
