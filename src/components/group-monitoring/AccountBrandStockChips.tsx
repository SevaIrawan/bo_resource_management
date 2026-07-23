import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import {
  ACCOUNT_HEADER_STOCK_BUCKETS,
  type GroupStockBucket,
  type GroupStockCounts,
} from '@/types/groupStock';

const STOCK_LABEL_KEY: Record<GroupStockBucket, string> = {
  active: 'operations.stock.active',
  ready: 'operations.stock.ready',
  recycle: 'operations.stock.recycle',
  review: 'operations.stock.review',
};

const STOCK_TOOLTIP_KEY: Record<GroupStockBucket, string> = {
  active: 'operations.stock.activeTooltip',
  ready: 'operations.stock.readyTooltip',
  recycle: 'operations.stock.recycleTooltip',
  review: 'operations.stock.reviewTooltip',
};

interface AccountBrandStockChipsProps {
  counts: GroupStockCounts;
  className?: string;
  onBucketClick?: (bucket: GroupStockBucket) => void;
}

/** Micro-chip stock header Account — Ready / Recycle / Review (tanpa Active). */
export function AccountBrandStockChips({
  counts,
  className,
  onBucketClick,
}: AccountBrandStockChipsProps) {
  const { t } = useLanguage();
  const interactive = Boolean(onBucketClick);

  return (
    <div
      className={cn('account-brand-stock-chips', className)}
      role="list"
      aria-label={t('operations.stock.ariaSummary')}
    >
      {ACCOUNT_HEADER_STOCK_BUCKETS.map((bucket) => (
        <button
          key={bucket}
          type="button"
          role="listitem"
          className={cn(
            'account-brand-stock-chip',
            `account-brand-stock-chip--${bucket}`,
            interactive && 'account-brand-stock-chip--interactive',
          )}
          title={
            interactive
              ? `${t(STOCK_TOOLTIP_KEY[bucket])} — ${t('operations.stock.clickHint')}`
              : t(STOCK_TOOLTIP_KEY[bucket])
          }
          onClick={(event) => {
            event.stopPropagation();
            onBucketClick?.(bucket);
          }}
          disabled={!interactive}
        >
          <span className="account-brand-stock-chip-count">{counts[bucket]}</span>
          <span className="account-brand-stock-chip-label">{t(STOCK_LABEL_KEY[bucket])}</span>
        </button>
      ))}
    </div>
  );
}
