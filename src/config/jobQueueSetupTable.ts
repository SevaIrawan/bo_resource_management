/** Job Queue setup + Account CTA setup — pagination & viewport. */
export const JOB_QUEUE_SETUP_PAGE_SIZE = 100;
/** Baris terlihat di layout sebelum scroll dalam page. */
export const JOB_QUEUE_SETUP_VISIBLE_ROWS = 10;

export function sliceJobQueueSetupPage<T>(
  rows: T[],
  page: number,
): {
  pageRows: T[];
  pageCount: number;
  pageSafe: number;
  pageFrom: number;
  pageTo: number;
  showPagination: boolean;
  pageOffset: number;
} {
  const pageCount = Math.max(1, Math.ceil(rows.length / JOB_QUEUE_SETUP_PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), pageCount);
  const pageOffset = (pageSafe - 1) * JOB_QUEUE_SETUP_PAGE_SIZE;
  return {
    pageRows: rows.slice(pageOffset, pageOffset + JOB_QUEUE_SETUP_PAGE_SIZE),
    pageCount,
    pageSafe,
    pageFrom: rows.length === 0 ? 0 : pageOffset + 1,
    pageTo: Math.min(pageOffset + JOB_QUEUE_SETUP_PAGE_SIZE, rows.length),
    showPagination: rows.length > JOB_QUEUE_SETUP_PAGE_SIZE,
    pageOffset,
  };
}
