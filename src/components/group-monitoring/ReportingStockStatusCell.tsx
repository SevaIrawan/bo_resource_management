import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import type { GroupStockBucket } from '@/types/groupStock';

const STOCK_LABEL_KEY: Record<GroupStockBucket, string> = {
  active: 'operations.stock.active',
  ready: 'operations.stock.ready',
  recycle: 'operations.stock.recycle',
  review: 'operations.stock.review',
  other: 'operations.stock.other',
};

interface ReportingStockStatusCellProps {
  status: GroupStockBucket;
  className?: string;
}

export function ReportingStockStatusCell({ status, className }: ReportingStockStatusCellProps) {
  const { t } = useLanguage();

  return (
    <span
      className={cn('operations-stock-chip', `operations-stock-chip--${status}`, className)}
      title={t(`operations.stock.${status}Tooltip`)}
    >
      <span className="operations-stock-chip-label">{t(STOCK_LABEL_KEY[status])}</span>
    </span>
  );
}
