import { useState } from 'react';
import { OperationsBrandHeaderMeta } from '@/components/group-monitoring/OperationsBrandHeaderMeta';
import { OperationsGroupStockStrip } from '@/components/group-monitoring/OperationsGroupStockStrip';
import { OperationsStockDetailModal } from '@/components/group-monitoring/OperationsStockDetailModal';
import { PlatformGroupsCountBadge } from '@/components/group-monitoring/PlatformGroupsCountBadge';
import { useLanguage } from '@/hooks/useLanguage';
import type { GroupStockBucket, GroupStockCounts, GroupStockHeaderMeta } from '@/types/groupStock';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

interface OperationsBrandCardProps {
  group: AccountBrandGroup;
  activePlatform: Platform;
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
  const [stockDetailBucket, setStockDetailBucket] = useState<GroupStockBucket | null>(null);

  return (
    <article className="brand-card operations-brand-card">
      <div className="brand-card-header operations-brand-card-header">
        <div className="brand-card-header-toggle operations-brand-card-toggle operations-brand-card-toggle--static">
          <span className="brand-card-title operations-brand-col-brand">
            {t('operations.brandCard.title', { brand: group.brandName })}
          </span>
          <OperationsBrandHeaderMeta meta={stockHeaderMeta} />
        </div>

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
    </article>
  );
}
