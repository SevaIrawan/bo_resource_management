import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { GROUP_LINKS_PAGE_SIZE } from '@/config/groupLinksTable';
import { useLanguage } from '@/hooks/useLanguage';

interface ReportingCardFooterProps {
  totalRows: number;
  page: number;
  onPageChange: (page: number) => void;
  onExport: () => void;
  exportDisabled?: boolean;
}

export function ReportingCardFooter({
  totalRows,
  page,
  onPageChange,
  onExport,
  exportDisabled = false,
}: ReportingCardFooterProps) {
  const { t } = useLanguage();

  const pageCount = Math.max(1, Math.ceil(totalRows / GROUP_LINKS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageOffset = (currentPage - 1) * GROUP_LINKS_PAGE_SIZE;
  const pageFrom = totalRows === 0 ? 0 : pageOffset + 1;
  const pageTo = Math.min(pageOffset + GROUP_LINKS_PAGE_SIZE, totalRows);
  const showPagination = totalRows > GROUP_LINKS_PAGE_SIZE;

  return (
    <footer className="reporting-card-footer">
      {showPagination ? (
        <div
          className="reporting-card-footer-meta"
          aria-label={t('groupMonitoring.groupLinks.pageLabel', {
            page: currentPage,
            pages: pageCount,
          })}
        >
          <span className="group-links-pagination-range">
            {t('groupMonitoring.groupLinks.pageRange', {
              from: pageFrom,
              to: pageTo,
              total: totalRows,
            })}
          </span>
          <span className="group-links-pagination-label">
            {t('groupMonitoring.groupLinks.pageLabel', {
              page: currentPage,
              pages: pageCount,
            })}
          </span>
        </div>
      ) : (
        <span className="reporting-card-footer-spacer" aria-hidden />
      )}

      <div className="reporting-card-footer-actions">
        {showPagination ? (
          <>
            <button
              type="button"
              className="group-links-page-btn"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              aria-label={t('groupMonitoring.groupLinks.prevPage')}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              {t('groupMonitoring.groupLinks.prevPage')}
            </button>
            <button
              type="button"
              className="group-links-page-btn"
              disabled={currentPage >= pageCount}
              onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
              aria-label={t('groupMonitoring.groupLinks.nextPage')}
            >
              {t('groupMonitoring.groupLinks.nextPage')}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="group-links-export-btn"
          onClick={onExport}
          disabled={exportDisabled || totalRows === 0}
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t('groupMonitoring.accountCard.export')}
        </button>
      </div>
    </footer>
  );
}

export function sliceReportingPage<T>(rows: T[], page: number): { pageRows: T[]; pageOffset: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / GROUP_LINKS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageOffset = (currentPage - 1) * GROUP_LINKS_PAGE_SIZE;
  return {
    pageRows: rows.slice(pageOffset, pageOffset + GROUP_LINKS_PAGE_SIZE),
    pageOffset,
  };
}
