import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import {
  GROUP_LINKS_PAGE_SIZE,
  GROUP_LINKS_VISIBLE_ROWS,
} from '@/config/groupLinksTable';
import { useLanguage } from '@/hooks/useLanguage';
import {
  fetchAccountDetailsGroupLinks,
  fetchAccountMasterGapGroupLinks,
  type AccountGroupLinkRow,
} from '@/lib/accountGroupLinks';
import { exportGroupLinksExcel } from '@/lib/exportExcel';
import { cn } from '@/lib/utils';

export type AccountMetricGroupsMode = 'account' | 'junk' | 'missing' | 'notAdmin';

interface GroupLinksModalProps {
  open: boolean;
  brandName: string;
  accountName: string;
  platform: 'whatsapp' | 'telegram';
  accountId?: string;
  /** Mode terkunci dari klik kolom — tanpa tab ganti konteks. */
  initialViewMode?: AccountMetricGroupsMode;
  onClose: () => void;
  /** Setelah animasi tutup — parent boleh clear state. */
  onExited?: () => void;
  onQuickAction?: (mode: Exclude<AccountMetricGroupsMode, 'account'>) => void;
  quickActionDisabled?: boolean;
}

const MODE_LABEL_KEY: Record<AccountMetricGroupsMode, string> = {
  account: 'groupMonitoring.groupLinks.modeAccount',
  junk: 'groupMonitoring.groupLinks.modeJunk',
  missing: 'groupMonitoring.accountCard.colMissing',
  notAdmin: 'groupMonitoring.accountCard.colNotAdmin',
};

async function loadLinksForMode(
  mode: AccountMetricGroupsMode,
  brandName: string,
  platform: 'whatsapp' | 'telegram',
  accountId?: string,
): Promise<AccountGroupLinkRow[]> {
  if (mode === 'missing' || mode === 'notAdmin') {
    const gaps = await fetchAccountMasterGapGroupLinks(brandName, platform, accountId);
    return mode === 'missing' ? gaps.missing : gaps.notAdmin;
  }
  const details = await fetchAccountDetailsGroupLinks(brandName, platform, accountId);
  return mode === 'junk' ? details.junk : details.account;
}

export function GroupLinksModal({
  open,
  brandName,
  accountName,
  platform,
  accountId,
  initialViewMode = 'account',
  onClose,
  onExited,
  onQuickAction,
  quickActionDisabled = false,
}: GroupLinksModalProps) {
  const { t } = useLanguage();
  const viewMode = initialViewMode;
  const [links, setLinks] = useState<AccountGroupLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const hasCacheRef = useRef(false);

  useEffect(() => {
    hasCacheRef.current = links.length > 0;
  }, [links]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [initialViewMode, open]);

  useEffect(() => {
    if (!open) {
      setLinks([]);
      setError(null);
      setLoading(false);
      hasCacheRef.current = false;
      return;
    }

    let cancelled = false;

    const runLoad = (soft = false) => {
      const keepPrevious = soft && hasCacheRef.current;
      if (!keepPrevious) {
        setLoading(true);
        setError(null);
        setLinks([]);
      }

      void loadLinksForMode(viewMode, brandName, platform, accountId)
        .then((next) => {
          if (cancelled) return;
          setLinks(next);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          if (!keepPrevious) {
            setLinks([]);
            setError(
              err instanceof Error ? err.message : t('groupMonitoring.sync.groupLinksFailed'),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    runLoad(false);

    const onDataRefresh = () => {
      if (!cancelled) runLoad(true);
    };
    window.addEventListener('rm-reporting-reload', onDataRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener('rm-reporting-reload', onDataRefresh);
    };
  }, [accountId, brandName, open, platform, t, viewMode]);

  const pageCount = Math.max(1, Math.ceil(links.length / GROUP_LINKS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageOffset = (currentPage - 1) * GROUP_LINKS_PAGE_SIZE;
  const pageRows = links.slice(pageOffset, pageOffset + GROUP_LINKS_PAGE_SIZE);
  const showPagination = links.length > GROUP_LINKS_PAGE_SIZE;
  const pageFrom = links.length === 0 ? 0 : pageOffset + 1;
  const pageTo = Math.min(pageOffset + GROUP_LINKS_PAGE_SIZE, links.length);
  const isAccountDaily = viewMode === 'account';
  const quickMode = viewMode === 'account' ? null : viewMode;
  const quickLabel =
    viewMode === 'missing'
      ? t('groupMonitoring.accountCard.metricQuickJoin')
      : viewMode === 'notAdmin'
        ? t('groupMonitoring.accountCard.metricQuickSetAdmin')
        : viewMode === 'junk'
          ? t('groupMonitoring.accountCard.metricQuickLeave')
          : null;
  const modeTitle = t(MODE_LABEL_KEY[viewMode]);

  function handleExport() {
    if (!links.length) return;
    exportGroupLinksExcel({
      brandName,
      accountName,
      rows: links,
      viewMode: viewMode === 'account' ? 'account' : 'junk',
    });
  }

  const showInitialLoading = loading && links.length === 0 && !error;

  return (
    <BrandModalRoot open={open} onBackdropClick={onClose} onExited={onExited}>
      <div
        className="brand-modal-panel brand-modal-panel--group-links brand-modal-panel--details-group"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-links-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header group-links-modal-header">
          <div className="group-links-modal-title-block">
            <h2 id="group-links-title" className="brand-modal-title group-links-modal-title">
              {modeTitle}
            </h2>
            <p className="brand-modal-subtitle">
              {brandName} · {accountName}
            </p>
          </div>
          <div className="group-links-header-tools">
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

        <div className="group-links-modal-body group-links-modal-body--details">
          {showInitialLoading ? (
            <div className="group-links-modal-loading group-links-modal-loading--fill">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : error ? (
            <div className="group-links-empty">
              <p className="group-links-empty-text" role="alert">
                {error}
              </p>
            </div>
          ) : links.length === 0 ? (
            <div className="group-links-empty">
              <p className="group-links-empty-text">{t('groupMonitoring.groupLinks.emptyNoData')}</p>
              <button
                type="button"
                className="join-report-table__filter-empty-btn"
                onClick={onClose}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                {t('groupMonitoring.groupLinks.emptyBack')}
              </button>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'group-links-table-wrap',
                  isAccountDaily && 'group-links-table-wrap--account-daily',
                  'group-links-table-wrap--scroll',
                )}
                style={
                  {
                    '--group-links-visible-rows': GROUP_LINKS_VISIBLE_ROWS,
                  } as CSSProperties
                }
              >
                <table
                  className={cn(
                    'group-links-table',
                    isAccountDaily && 'group-links-table--account-daily',
                  )}
                >
                  <thead>
                    <tr>
                      {isAccountDaily ? (
                        <>
                          <th>{t('groupMonitoring.groupLinks.colNo')}</th>
                          <th>{t('groupMonitoring.groupLinks.colName')}</th>
                          <th>{t('groupMonitoring.groupLinks.colId')}</th>
                          <th>{t('groupMonitoring.groupLinks.colMemberCount')}</th>
                          <th>{t('groupMonitoring.groupLinks.colAdminCount')}</th>
                          <th>{t('groupMonitoring.groupLinks.colIsAdmin')}</th>
                          <th>{t('groupMonitoring.groupLinks.colLink')}</th>
                        </>
                      ) : (
                        <>
                          <th>{t('groupMonitoring.groupLinks.colName')}</th>
                          <th>{t('groupMonitoring.groupLinks.colId')}</th>
                          <th>{t('groupMonitoring.groupLinks.colLink')}</th>
                          <th>{t('groupMonitoring.groupLinks.colAdmin')}</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, index) => (
                      <tr key={`${viewMode}-${row.groupId}-${row.groupName}`}>
                        {isAccountDaily ? (
                          <>
                            <td className="group-links-table__num tabular-nums">
                              {pageOffset + index + 1}
                            </td>
                            <td className="group-links-table__name" title={row.groupName}>
                              {row.groupName}
                            </td>
                            <td className="group-links-table__id" title={row.groupId}>
                              {row.groupId || '—'}
                            </td>
                            <td className="group-links-table__count tabular-nums">
                              {row.memberCount}
                            </td>
                            <td className="group-links-table__count tabular-nums">
                              {row.adminCount}
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
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </>
          )}
        </div>

        {!showInitialLoading ? (
          <footer className="group-links-modal-footer group-links-modal-footer--metric">
            <div className="group-links-modal-footer-meta">
              {showPagination ? (
                <>
                  <span className="group-links-pagination-range">
                    {t('groupMonitoring.groupLinks.pageRange', {
                      from: pageFrom,
                      to: pageTo,
                      total: links.length,
                    })}
                  </span>
                  <span className="group-links-pagination-label">
                    {t('groupMonitoring.groupLinks.pageLabel', {
                      page: currentPage,
                      pages: pageCount,
                    })}
                  </span>
                </>
              ) : null}
            </div>
            <div className="group-links-modal-footer-actions">
              {showPagination ? (
                <>
                  <button
                    type="button"
                    className="group-links-page-btn group-links-page-btn--icon"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label={t('groupMonitoring.groupLinks.prevPage')}
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="group-links-page-btn group-links-page-btn--icon"
                    disabled={currentPage >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    aria-label={t('groupMonitoring.groupLinks.nextPage')}
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="group-links-export-btn"
                onClick={handleExport}
                disabled={links.length === 0}
              >
                <Download className="h-3 w-3" strokeWidth={2} aria-hidden />
                {t('groupMonitoring.accountCard.export')}
              </button>
              {quickMode && quickLabel && onQuickAction ? (
                <button
                  type="button"
                  className="group-links-export-btn"
                  disabled={quickActionDisabled || links.length === 0}
                  onClick={() => onQuickAction(quickMode)}
                >
                  {quickLabel}
                </button>
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>
    </BrandModalRoot>
  );
}
