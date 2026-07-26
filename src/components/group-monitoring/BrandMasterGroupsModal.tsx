import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ReportingCardFooter, sliceReportingPage } from '@/components/group-monitoring/ReportingCardFooter';
import { ReportingJoinMatrixTable } from '@/components/group-monitoring/ReportingJoinMatrixTable';
import { PlatformGroupsCountBadge } from '@/components/group-monitoring/PlatformGroupsCountBadge';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import {
  exportReportingMatrixExcel,
  type ReportingExportBookmark,
} from '@/lib/exportExcel';
import {
  loadJoinGroupMatrix,
  type JoinGroupMatrixRow,
  type ReportingAccountRef,
} from '@/lib/loadJoinGroupReport';
import {
  filterReportingMatrixRows,
  type ReportingMatrixColumnFilter,
} from '@/lib/reportingMatrixColumn';
import { filterReportingRowsByGroupSearch } from '@/lib/filterReportingGroupName';
import { cn } from '@/lib/utils';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

interface BrandMasterGroupsModalProps {
  open: boolean;
  brandName: string;
  platform: Platform;
  accounts: AccountBrandRow[];
  onClose: () => void;
}

export function BrandPlatformGroupsBadgeButton({
  platform,
  count,
  onClick,
}: {
  platform: Platform;
  count: number;
  onClick: () => void;
}) {
  return (
    <PlatformGroupsCountBadge
      platform={platform}
      count={count}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    />
  );
}

/** Detail Group header Account — matrix Acc=All (semua akun brand+platform), Full Group | Full Admin. */
export function BrandMasterGroupsModal({
  open,
  brandName,
  platform,
  accounts,
  onClose,
}: BrandMasterGroupsModalProps) {
  const { t } = useLanguage();
  const [bookmark, setBookmark] = useState<ReportingExportBookmark>('full_group');
  const [rows, setRows] = useState<JoinGroupMatrixRow[]>([]);
  const [columnFilter, setColumnFilter] = useState<ReportingMatrixColumnFilter>(null);
  const [groupSearchDraft, setGroupSearchDraft] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const hasRowsRef = useRef(false);

  useEffect(() => {
    hasRowsRef.current = rows.length > 0;
  }, [rows]);

  const reportingAccounts = useMemo<ReportingAccountRef[]>(
    () =>
      accounts
        .filter((account) => account.platform === platform)
        .map((account) => ({ id: account.id, accountName: account.accountName }))
        .sort((a, b) => a.accountName.localeCompare(b.accountName)),
    [accounts, platform],
  );

  const reload = useCallback(
    async (soft = false) => {
      if (!open) return;
      if (!brandName.trim() || reportingAccounts.length === 0) {
        setRows([]);
        setError(null);
        setLoading(false);
        return;
      }

      const keepPrevious = soft && hasRowsRef.current;
      if (!keepPrevious) {
        setLoading(true);
        setError(null);
      }

      try {
        const next = await loadJoinGroupMatrix({
          brandName,
          platform,
          accounts: reportingAccounts,
        });
        setRows(next);
        setError(null);
      } catch (loadError) {
        if (!keepPrevious) {
          setRows([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : t('groupMonitoring.brandMasterDetail.loadFailed'),
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [brandName, open, platform, reportingAccounts, t],
  );

  useEffect(() => {
    if (!open) {
      setRows([]);
      setError(null);
      setLoading(false);
      hasRowsRef.current = false;
      return;
    }
    setBookmark('full_group');
    setColumnFilter(null);
    setGroupSearchDraft('');
    setGroupSearch('');
    setPage(1);
    void reload(false);
  }, [open, reload]);

  useEffect(() => {
    if (!open) return;
    const onReload = () => void reload(true);
    window.addEventListener('rm-reporting-reload', onReload);
    return () => window.removeEventListener('rm-reporting-reload', onReload);
  }, [open, reload]);

  const mode = bookmark === 'full_admin' ? 'admin' : 'join';
  const filteredRows = useMemo(() => {
    const bySearch = filterReportingRowsByGroupSearch(rows, groupSearch);
    return filterReportingMatrixRows(bySearch, columnFilter, mode);
  }, [columnFilter, groupSearch, mode, rows]);
  const matrixPage = sliceReportingPage(filteredRows, page);

  useEffect(() => {
    setColumnFilter(null);
    setPage(1);
  }, [bookmark]);

  useEffect(() => {
    setPage(1);
  }, [columnFilter, groupSearch]);

  const platformLabel =
    platform === 'whatsapp'
      ? t('groupMonitoring.brandMasterDetail.platformWa')
      : t('groupMonitoring.brandMasterDetail.platformTg');

  /** Spinner hanya buka awal — soft realtime tetap tampilkan matrix. */
  const showInitialLoading = loading && rows.length === 0;

  return (
    <BrandModalRoot open={open} onBackdropClick={onClose}>
      <section
        className="brand-modal-panel brand-modal-panel--group-links brand-modal-panel--reporting-matrix"
        role="dialog"
        aria-modal="true"
        aria-labelledby="brand-master-groups-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header group-links-modal-header">
          <h2 id="brand-master-groups-title" className="brand-modal-title group-links-modal-title">
            {brandName} {platformLabel}
          </h2>
          <div className="brand-modal-header-actions">
            <button
              type="button"
              className="brand-modal-close"
              onClick={onClose}
              aria-label={t('groupMonitoring.accountCard.closeModal')}
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="brand-master-reporting-modal-body">
          {!showInitialLoading && !error && reportingAccounts.length > 0 ? (
            <div className="brand-master-reporting-toolbar">
              <form
                className="account-slicer-search-group brand-master-reporting-search-group"
                onSubmit={(event) => {
                  event.preventDefault();
                  setGroupSearch(groupSearchDraft);
                  setPage(1);
                }}
              >
                <input
                  type="search"
                  value={groupSearchDraft}
                  onChange={(event) => setGroupSearchDraft(event.target.value)}
                  placeholder={t('groupMonitoring.reporting.searchGroupNamePlaceholder')}
                  className="account-slicer-search"
                  aria-label={t('groupMonitoring.reporting.searchGroupNamePlaceholder')}
                />
                <button
                  type="submit"
                  className="account-slicer-search-btn account-slicer-search-btn--enter"
                  aria-label={t('groupMonitoring.searchEnter')}
                >
                  {t('groupMonitoring.searchEnter')}
                </button>
              </form>
              <div
                className="account-slicer-view-toggle"
                role="group"
                aria-label={t('groupMonitoring.reporting.bookmarksLabel')}
              >
                {(['full_group', 'full_admin'] as ReportingExportBookmark[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      'account-slicer-view-btn',
                      bookmark === value && 'account-slicer-view-btn--active',
                    )}
                    onClick={() => setBookmark(value)}
                  >
                    {value === 'full_group'
                      ? t('groupMonitoring.reporting.bookmarkFullGroup')
                      : t('groupMonitoring.reporting.bookmarkFullAdmin')}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {showInitialLoading ? (
            <div className="group-links-modal-loading">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : error ? (
            <p className="platform-login-field-error" role="alert">
              {error}
            </p>
          ) : reportingAccounts.length === 0 ? (
            <p className="reporting-empty px-5 py-4 text-sm text-text-muted">
              {t('groupMonitoring.reporting.noAccounts')}
            </p>
          ) : (
            <ReportingJoinMatrixTable
              rows={matrixPage.pageRows}
              accounts={reportingAccounts}
              brandName={brandName}
              mode={mode}
              pageOffset={matrixPage.pageOffset}
              columnFilter={columnFilter}
              onColumnFilterChange={setColumnFilter}
              groupNameSearch={groupSearch}
              onClearGroupNameSearch={() => {
                setGroupSearchDraft('');
                setGroupSearch('');
              }}
            />
          )}
        </div>

        {!showInitialLoading && !error && reportingAccounts.length > 0 ? (
          <ReportingCardFooter
            totalRows={filteredRows.length}
            page={page}
            onPageChange={setPage}
            onExport={() =>
              exportReportingMatrixExcel({
                meta: {
                  brandName,
                  platform,
                  bookmark,
                  accountScope: 'all',
                },
                accounts: reportingAccounts,
                rows: filteredRows,
              })
            }
            exportDisabled={filteredRows.length === 0}
          />
        ) : null}
      </section>
    </BrandModalRoot>
  );
}
