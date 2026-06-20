import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import {
  GROUP_STOCK_BUCKETS,
  type GroupStockBucket,
  type GroupStockCounts,
} from '@/types/groupStock';

const STOCK_LABEL_KEY: Record<GroupStockBucket, string> = {
  active: 'operations.stock.active',
  ready: 'operations.stock.ready',
  recycle: 'operations.stock.recycle',
  review: 'operations.stock.review',
  other: 'operations.stock.other',
};

const STOCK_TOOLTIP_KEY: Record<GroupStockBucket, string> = {
  active: 'operations.stock.activeTooltip',
  ready: 'operations.stock.readyTooltip',
  recycle: 'operations.stock.recycleTooltip',
  review: 'operations.stock.reviewTooltip',
  other: 'operations.stock.otherTooltip',
};

interface OperationsGroupStockStripProps {
  counts: GroupStockCounts;
  className?: string;
  onBucketDoubleClick?: (bucket: GroupStockBucket) => void;
}

/** Chip stock opname — label + angka; double-click buka modal detail bucket. */
export function OperationsGroupStockStrip({
  counts,
  className,
  onBucketDoubleClick,
}: OperationsGroupStockStripProps) {
  const { t } = useLanguage();
  const interactive = Boolean(onBucketDoubleClick);

  return (
    <div
      className={cn('operations-group-stock-strip', className)}
      role="list"
      aria-label={t('operations.stock.ariaSummary')}
    >
      {GROUP_STOCK_BUCKETS.map((bucket) => (
        <button
          key={bucket}
          type="button"
          role="listitem"
          className={cn(
            'operations-stock-chip',
            `operations-stock-chip--${bucket}`,
            interactive && 'operations-stock-chip--interactive',
          )}
          title={
            interactive
              ? `${t(STOCK_TOOLTIP_KEY[bucket])} — ${t('operations.stock.doubleClickHint')}`
              : t(STOCK_TOOLTIP_KEY[bucket])
          }
          onDoubleClick={(event) => {
            event.stopPropagation();
            onBucketDoubleClick?.(bucket);
          }}
          disabled={!interactive}
        >
          <span className="operations-stock-chip-label">{t(STOCK_LABEL_KEY[bucket])}</span>
          <span className="operations-stock-chip-count">{counts[bucket]}</span>
        </button>
      ))}
    </div>
  );
}
