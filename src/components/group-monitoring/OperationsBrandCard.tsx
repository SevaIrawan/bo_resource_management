import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { OperationsBrandHeaderMeta } from '@/components/group-monitoring/OperationsBrandHeaderMeta';
import { OperationsGroupStockStrip } from '@/components/group-monitoring/OperationsGroupStockStrip';
import { OperationsStockDetailModal } from '@/components/group-monitoring/OperationsStockDetailModal';
import { PlatformGroupsCountBadge } from '@/components/group-monitoring/PlatformGroupsCountBadge';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import type { GroupStockBucket, GroupStockCounts, GroupStockHeaderMeta } from '@/types/groupStock';import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

interface OperationsBrandCardProps {
  group: AccountBrandGroup;
  activePlatform: Platform;
  /** Jumlah baris unik groups_master brand+platform (bukan cache Account grid). */
  masterGroupCount: number;
  stockCounts: GroupStockCounts;
  stockHeaderMeta: GroupStockHeaderMeta;
}

export function OperationsBrandCard({
  group,
  activePlatform,
  masterGroupCount,
  stockCounts,
  stockHeaderMeta,
}: OperationsBrandCardProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [stockDetailBucket, setStockDetailBucket] = useState<GroupStockBucket | null>(null);

  return (
    <article className="brand-card operations-brand-card">
      <div className="brand-card-header operations-brand-card-header">
        <button
          type="button"
          className="brand-card-header-toggle operations-brand-card-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              'brand-card-chevron operations-brand-col-chevron',
              !expanded && 'brand-card-chevron--collapsed',
            )}
            aria-hidden
          />
          <span className="brand-card-title operations-brand-col-brand">
            {t('operations.brandCard.title', { brand: group.brandName })}
          </span>
          <OperationsBrandHeaderMeta meta={stockHeaderMeta} />
        </button>

        <div className="operations-brand-card-metrics">
          <PlatformGroupsCountBadge platform={activePlatform} count={masterGroupCount} />
          <div className="operations-stock-panel">
            <OperationsGroupStockStrip
              counts={stockCounts}
              onBucketDoubleClick={setStockDetailBucket}
            />
          </div>
        </div>
      </div>

      {stockDetailBucket ? (
        <OperationsStockDetailModal
          open
          brandName={group.brandName}
          platform={activePlatform}
          bucket={stockDetailBucket}
          onClose={() => setStockDetailBucket(null)}
        />
      ) : null}

      {expanded ? (
        <div className="brand-card-body operations-brand-card-body">
          <p className="operations-expand-placeholder">{t('operations.expandPlaceholder')}</p>
        </div>
      ) : null}
    </article>
  );
}
