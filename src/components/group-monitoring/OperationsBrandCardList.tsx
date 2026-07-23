import { OperationsBrandCard } from '@/components/group-monitoring/OperationsBrandCard';
import type { OperationsPolicyByBrand } from '@/config/operationsStockPolicy';
import { buildStockHeaderMeta } from '@/lib/buildStockHeaderMeta';
import { readGroupStockCounts } from '@/lib/classifyGroupStock';
import { readMasterGroupCount } from '@/lib/loadOperationsMasterCounts';
import { useLanguage } from '@/hooks/useLanguage';
import type { GroupStockCounts } from '@/types/groupStock';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

interface OperationsBrandCardListProps {
  groups: AccountBrandGroup[];
  activePlatform: Platform;
  masterCounts: Map<string, number>;
  stockCounts: Map<string, GroupStockCounts>;
  avgNdByLine: Map<string, number>;
  operationsPolicyByBrand: OperationsPolicyByBrand;
}

export function OperationsBrandCardList({
  groups,
  activePlatform,
  masterCounts,
  stockCounts,
  avgNdByLine,
  operationsPolicyByBrand,
}: OperationsBrandCardListProps) {
  const { t } = useLanguage();

  if (groups.length === 0) {
    return (
      <div className="ticket-card-list ticket-card-list--empty account-filter-empty">
        <p className="ticket-empty-title">{t('operations.noBrands')}</p>
        <p className="ticket-empty-desc">{t('operations.noBrandsDesc')}</p>
      </div>
    );
  }

  return (
    <div className="brand-card-list operations-brand-card-list">
      {groups.map((group) => (
        <OperationsBrandCard
          key={group.id}
          group={group}
          activePlatform={activePlatform}
          masterGroupCount={readMasterGroupCount(masterCounts, group.brandName, activePlatform)}
          stockCounts={readGroupStockCounts(stockCounts, group.brandName, activePlatform)}
          stockHeaderMeta={buildStockHeaderMeta(
            group.brandName,
            activePlatform,
            masterCounts,
            stockCounts,
            avgNdByLine,
            operationsPolicyByBrand,
          )}
        />
      ))}
    </div>
  );
}
