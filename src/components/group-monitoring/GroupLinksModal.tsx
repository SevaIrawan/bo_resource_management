import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { DarkSelect } from '@/components/ui/DarkSelect';
import {
  GROUP_LINKS_PAGE_SIZE,
  GROUP_LINKS_VISIBLE_ROWS,
} from '@/config/groupLinksTable';
import { useLanguage } from '@/hooks/useLanguage';
import { fetchAccountGroupLinks, type AccountGroupLinkRow } from '@/lib/accountGroupLinks';
import { exportGroupLinksExcel } from '@/lib/exportExcel';
import { cn } from '@/lib/utils';

interface GroupLinksModalProps {
  open: boolean;
  brandName: string;
  accountName: string;
  platform: 'whatsapp' | 'telegram';
  accountId?: string;
  onClose: () => void;
}

type AdminFilter = 'all' | 'yes' | 'no';

function AdminFilterSlicer({
  value,
  onChange,
  label,
  options,
}: {
  value: AdminFilter;
  onChange: (value: AdminFilter) => void;
  label: string;
  options: { value: AdminFilter; label: string }[];
}) {
  return (
    <div className="group-links-admin-slicer">
      <span className="group-links-admin-slicer-label">{label}</span>
      <DarkSelect
        value={value}
        onChange={(next) => onChange(next as AdminFilter)}
        options={options}
        ariaLabel={label}
        className="group-links-admin-slicer-select"
        triggerClassName="account-slicer-select"
      />
    </div>
  );
}

export function GroupLinksModal({
  open,
  brandName,
  accountName,
  platform,
  accountId,
  onClose,
}: GroupLinksModalProps) {
  const { t } = useLanguage();
  const [links, setLinks] = useState<AccountGroupLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminFilter, setAdminFilter] = useState<AdminFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!open) return;
    setAdminFilter('all');
    setPage(1);
  }, [open]);

  useEffect(() => {
    setPage(1);
  }, [adminFilter]);

  const filteredLinks = useMemo(() => {
    if (adminFilter === 'all') return links;
    return links.filter((row) => row.isAdmin === adminFilter);
  }, [adminFilter, links]);

  const pageCount = Math.max(1, Math.ceil(filteredLinks.length / GROUP_LINKS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageOffset = (currentPage - 1) * GROUP_LINKS_PAGE_SIZE;
  const pageRows = filteredLinks.slice(pageOffset, pageOffset + GROUP_LINKS_PAGE_SIZE);
  const showPagination = filteredLinks.length > GROUP_LINKS_PAGE_SIZE;
  const tableNeedsScroll = pageRows.length > GROUP_LINKS_VISIBLE_ROWS;

  const pageFrom = filteredLinks.length === 0 ? 0 : pageOffset + 1;
  const pageTo = Math.min(pageOffset + GROUP_LINKS_PAGE_SIZE, filteredLinks.length);

  const adminFilterOptions: { value: AdminFilter; label: string }[] = [
    { value: 'all', label: t('groupMonitoring.groupLinks.filterAll') },
    { value: 'yes', label: t('groupMonitoring.groupLinks.adminYes') },
    { value: 'no', label: t('groupMonitoring.groupLinks.adminNo') },
  ];

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchAccountGroupLinks(brandName, platform, accountId)
      .then((rows) => {
        if (!cancelled) setLinks(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('groupMonitoring.sync.groupLinksFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, accountName, brandName, open, t]);

  if (!open) return null;

  function handleExport() {
    if (!filteredLinks.length) return;
    exportGroupLinksExcel({ brandName, accountName, rows: filteredLinks });
  }

  return (
    <BrandModalRoot onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--group-links"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-links-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header group-links-modal-header">
          <h2 id="group-links-title" className="brand-modal-title group-links-modal-title">
            {brandName} {accountName}
          </h2>
          <div className="group-links-header-tools">
            <AdminFilterSlicer
              value={adminFilter}
              onChange={setAdminFilter}
              label={t('groupMonitoring.groupLinks.filterAdmin')}
              options={adminFilterOptions}
            />
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

        <div className="group-links-modal-body">
          {loading ? (
            <div className="group-links-modal-loading">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : error ? (
            <p className="platform-login-field-error" role="alert">
              {error}
            </p>
          ) : links.length === 0 ? (
            <p className="sync-modal-message">{t('groupMonitoring.sync.groupLinksEmpty')}</p>
          ) : filteredLinks.length === 0 ? (
            <p className="sync-modal-message">{t('groupMonitoring.groupLinks.filterEmpty')}</p>
          ) : (
            <>
              <div
                className={cn(
                  'group-links-table-wrap',
                  tableNeedsScroll && 'group-links-table-wrap--scroll',
                )}
                style={
                  {
                    '--group-links-visible-rows': GROUP_LINKS_VISIBLE_ROWS,
                  } as CSSProperties
                }
              >
                <table className="group-links-table">
                  <thead>
                    <tr>
                      <th>{t('groupMonitoring.groupLinks.colName')}</th>
                      <th>{t('groupMonitoring.groupLinks.colId')}</th>
                      <th>{t('groupMonitoring.groupLinks.colLink')}</th>
                      <th>{t('groupMonitoring.groupLinks.colAdmin')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={`${row.groupId}-${row.groupName}`}>
                        <td className="group-links-table__name" title={row.groupName}>
                          {row.groupName}
                        </td>
                        <td className="group-links-table__id" title={row.groupId}>
                          {row.groupId || '—'}
                        </td>
                        <td className="group-links-table__link">
                          {row.inviteLink ? (
                            <a
                              href={row.inviteLink}
                              target="_blank"
                              rel="noreferrer"
                              title={row.inviteLink}
                            >
                              {row.inviteLink}
                            </a>
                          ) : (
                            <span className="group-links-table__muted">—</span>
                          )}
                        </td>
                        <td className="group-links-table__admin">
                          <span
                            className={
                              row.isAdmin === 'yes'
                                ? 'group-links-admin-badge group-links-admin-badge--yes'
                                : 'group-links-admin-badge group-links-admin-badge--no'
                            }
                          >
                            {row.isAdmin === 'yes'
                              ? t('groupMonitoring.groupLinks.adminYes')
                              : t('groupMonitoring.groupLinks.adminNo')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tableNeedsScroll ? (
                <p className="group-links-table-hint">
                  {t('groupMonitoring.groupLinks.viewportHint', {
                    max: GROUP_LINKS_VISIBLE_ROWS,
                  })}
                </p>
              ) : null}

              {showPagination ? (
                <nav className="group-links-pagination" aria-label={t('groupMonitoring.groupLinks.pageLabel', { page: currentPage, pages: pageCount })}>
                  <span className="group-links-pagination-range">
                    {t('groupMonitoring.groupLinks.pageRange', {
                      from: pageFrom,
                      to: pageTo,
                      total: filteredLinks.length,
                    })}
                  </span>
                  <span className="group-links-pagination-label">
                    {t('groupMonitoring.groupLinks.pageLabel', {
                      page: currentPage,
                      pages: pageCount,
                    })}
                  </span>
                  <div className="group-links-pagination-actions">
                    <button
                      type="button"
                      className="group-links-page-btn"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label={t('groupMonitoring.groupLinks.prevPage')}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      {t('groupMonitoring.groupLinks.prevPage')}
                    </button>
                    <button
                      type="button"
                      className="group-links-page-btn"
                      disabled={currentPage >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      aria-label={t('groupMonitoring.groupLinks.nextPage')}
                    >
                      {t('groupMonitoring.groupLinks.nextPage')}
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </nav>
              ) : null}
            </>
          )}
        </div>

        <footer className="group-links-modal-footer">
          <button
            type="button"
            className="group-links-export-btn"
            onClick={handleExport}
            disabled={loading || filteredLinks.length === 0}
          >
            <Download className="h-3 w-3" strokeWidth={2} aria-hidden />
            {t('groupMonitoring.accountCard.export')}
          </button>
        </footer>
      </div>
    </BrandModalRoot>
  );
}
