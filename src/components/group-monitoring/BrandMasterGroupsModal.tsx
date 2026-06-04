import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { BrandImage } from '@/components/brand/BrandImage';
import {
  GROUP_LINKS_PAGE_SIZE,
  GROUP_LINKS_VISIBLE_ROWS,
} from '@/config/groupLinksTable';
import { useLanguage } from '@/hooks/useLanguage';
import {
  fetchBrandMasterGroupDetails,
  type BrandMasterGroupDetailRow,
} from '@/lib/brandMasterGroupDetails';
import { exportBrandMasterGroupsExcel } from '@/lib/exportExcel';
import { formatLastSyncAt } from '@/lib/formatLastSync';
import { cn } from '@/lib/utils';
import type { Platform } from '@/types/database';

interface BrandMasterGroupsModalProps {
  open: boolean;
  brandName: string;
  platform: Platform;
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
  const { t } = useLanguage();
  const asset = platform === 'whatsapp' ? 'whatsapp' : 'telegram';
  const label =
    platform === 'whatsapp'
      ? t('groupMonitoring.accountCard.platformGroupsBadgeWa', { count })
      : t('groupMonitoring.accountCard.platformGroupsBadgeTg', { count });

  return (
    <button
      type="button"
      className="brand-card-badge brand-card-badge--neutral brand-card-badge--split brand-card-badge--clickable"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
    >
      <BrandImage asset={asset} alt="" className="mr-1 inline h-3 w-3 opacity-80" aria-hidden />
      {label}
    </button>
  );
}

export function BrandMasterGroupsModal({
  open,
  brandName,
  platform,
  onClose,
}: BrandMasterGroupsModalProps) {
  const { t, locale } = useLanguage();
  const [rows, setRows] = useState<BrandMasterGroupDetailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const platformLabel =
    platform === 'whatsapp'
      ? t('groupMonitoring.brandMasterDetail.platformWa')
      : t('groupMonitoring.brandMasterDetail.platformTg');

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchBrandMasterGroupDetails(brandName, platform)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t('groupMonitoring.brandMasterDetail.loadFailed'),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandName, open, platform, t]);

  const pageCount = Math.max(1, Math.ceil(rows.length / GROUP_LINKS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageOffset = (currentPage - 1) * GROUP_LINKS_PAGE_SIZE;
  const pageRows = rows.slice(pageOffset, pageOffset + GROUP_LINKS_PAGE_SIZE);
  const showPagination = rows.length > GROUP_LINKS_PAGE_SIZE;
  const tableNeedsScroll = pageRows.length > GROUP_LINKS_VISIBLE_ROWS;
  const pageFrom = rows.length === 0 ? 0 : pageOffset + 1;
  const pageTo = Math.min(pageOffset + GROUP_LINKS_PAGE_SIZE, rows.length);

  if (!open) return null;

  function handleExport() {
    if (!rows.length) return;
    exportBrandMasterGroupsExcel({ brandName, platform, rows });
  }

  return (
    <BrandModalRoot onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--group-links"
        role="dialog"
        aria-modal="true"
        aria-labelledby="brand-master-groups-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header group-links-modal-header">
          <h2 id="brand-master-groups-title" className="brand-modal-title group-links-modal-title">
            {brandName} {platformLabel}
          </h2>
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

        <div className="group-links-modal-body">
          {loading ? (
            <div className="group-links-modal-loading">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : error ? (
            <p className="platform-login-field-error" role="alert">
              {error}
            </p>
          ) : rows.length === 0 ? (
            <p className="sync-modal-message">{t('groupMonitoring.brandMasterDetail.empty')}</p>
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
                      <th>{t('groupMonitoring.brandMasterDetail.colName')}</th>
                      <th>{t('groupMonitoring.brandMasterDetail.colId')}</th>
                      <th>{t('groupMonitoring.brandMasterDetail.colLink')}</th>
                      <th>{t('groupMonitoring.brandMasterDetail.colLastSync')}</th>
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
                            <a href={row.inviteLink} target="_blank" rel="noreferrer" title={row.inviteLink}>
                              {row.inviteLink}
                            </a>
                          ) : (
                            <span className="group-links-table__muted">—</span>
                          )}
                        </td>
                        <td className="group-links-table__sync tabular-nums text-text-secondary">
                          {formatLastSyncAt(row.lastSync, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showPagination ? (
                <nav
                  className="group-links-pagination"
                  aria-label={t('groupMonitoring.groupLinks.pageLabel', {
                    page: currentPage,
                    pages: pageCount,
                  })}
                >
                  <span className="group-links-pagination-range">
                    {t('groupMonitoring.groupLinks.pageRange', {
                      from: pageFrom,
                      to: pageTo,
                      total: rows.length,
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
            disabled={loading || rows.length === 0}
          >
            <Download className="h-3 w-3" strokeWidth={2} aria-hidden />
            {t('groupMonitoring.accountCard.export')}
          </button>
        </footer>
      </div>
    </BrandModalRoot>
  );
}
