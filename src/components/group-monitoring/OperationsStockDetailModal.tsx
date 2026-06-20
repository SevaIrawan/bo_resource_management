import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import {
  GROUP_LINKS_PAGE_SIZE,
  GROUP_LINKS_VISIBLE_ROWS,
} from '@/config/groupLinksTable';
import { useLanguage } from '@/hooks/useLanguage';
import { exportOperationsStockBucketExcel } from '@/lib/exportExcel';
import { fetchOperationsStockBucketDetails } from '@/lib/loadOperationsStockBucketDetails';
import { formatLastSyncAt } from '@/lib/formatLastSync';
import { cn } from '@/lib/utils';
import type { GroupStockBucket } from '@/types/groupStock';
import type { Platform } from '@/types/database';

const STOCK_LABEL_KEY: Record<GroupStockBucket, string> = {
  active: 'operations.stock.active',
  ready: 'operations.stock.ready',
  recycle: 'operations.stock.recycle',
  review: 'operations.stock.review',
  other: 'operations.stock.other',
};

interface OperationsStockDetailModalProps {
  open: boolean;
  brandName: string;
  platform: Platform;
  bucket: GroupStockBucket;
  onClose: () => void;
}

export function OperationsStockDetailModal({
  open,
  brandName,
  platform,
  bucket,
  onClose,
}: OperationsStockDetailModalProps) {
  const { t, locale } = useLanguage();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchOperationsStockBucketDetails>>>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const platformLabel =
    platform === 'whatsapp'
      ? t('groupMonitoring.brandMasterDetail.platformWa')
      : t('groupMonitoring.brandMasterDetail.platformTg');
  const bucketLabel = t(STOCK_LABEL_KEY[bucket]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open, bucket]);

  const loadDetailRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOperationsStockBucketDetails(brandName, platform, bucket);
      setRows(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('operations.stock.detail.loadFailed'),
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [brandName, bucket, platform, t]);

  useEffect(() => {
    if (!open) return;
    void loadDetailRows();
  }, [loadDetailRows, open]);

  useEffect(() => {
    if (!open) return;
    const onMasterReload = () => void loadDetailRows();
    window.addEventListener('rm-operations-reload', onMasterReload);
    return () => window.removeEventListener('rm-operations-reload', onMasterReload);
  }, [loadDetailRows, open]);

  const pageCount = Math.max(1, Math.ceil(rows.length / GROUP_LINKS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageOffset = (currentPage - 1) * GROUP_LINKS_PAGE_SIZE;
  const pageRows = rows.slice(pageOffset, pageOffset + GROUP_LINKS_PAGE_SIZE);
  const showPagination = rows.length > GROUP_LINKS_PAGE_SIZE;
  const tableNeedsScroll = pageRows.length > GROUP_LINKS_VISIBLE_ROWS;
  const pageFrom = rows.length === 0 ? 0 : pageOffset + 1;
  const pageTo = Math.min(pageOffset + GROUP_LINKS_PAGE_SIZE, rows.length);

  const handleExport = () => {
    if (rows.length === 0) return;
    exportOperationsStockBucketExcel({
      brandName,
      platform,
      bucket,
      rows,
      locale,
    });
  };

  if (!open) return null;

  return (
    <BrandModalRoot onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--group-links"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operations-stock-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header group-links-modal-header">
          <h2 id="operations-stock-detail-title" className="brand-modal-title group-links-modal-title">
            {t('operations.stock.detail.title', {
              brand: brandName,
              bucket: bucketLabel,
              platform: platformLabel,
            })}
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
            <p className="sync-modal-message">{t('operations.stock.detail.empty')}</p>
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
                      <th>{t('operations.stock.detail.colNonAdmin')}</th>
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
                        <td className="tabular-nums text-text-secondary">{row.memberNonAdmin}</td>
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
