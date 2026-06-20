import {
  AccountSlicerBar,
  ContentNestedPanel,
} from '@/components/group-monitoring/ContentAreaCard';
import { OperationsBrandCardList } from '@/components/group-monitoring/OperationsBrandCardList';
import { OperationsSlicerHeader } from '@/components/group-monitoring/OperationsSlicerHeader';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';
import { loadAvgNewDepositorByLine } from '@/lib/loadAvgNewDepositor';
import { loadMasterGroupCountsByBrandPlatform } from '@/lib/loadOperationsMasterCounts';
import { loadOperationsStockCountsByBrandPlatform } from '@/lib/loadOperationsStockCounts';
import { readOperationsPolicyByBrand, type OperationsPolicyByBrand } from '@/config/operationsStockPolicy';
import type { GroupStockCounts } from '@/types/groupStock';
import {
  filterOperationsBrandGroups,
  normalizeOperationsFilters,
  OPERATIONS_FILTER_DEFAULT,
  type OperationsSlicerFilters,
} from '@/lib/operationsFilters';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Tab Operations — brand cards; filter & badge count independen dari tab Account. */
export function OperationsMonitoringPanel() {
  const { t } = useLanguage();
  const { groups, loading } = useGroupMonitoring();
  const reloadSeqRef = useRef(0);
  const [filters, setFilters] = useState<OperationsSlicerFilters>(OPERATIONS_FILTER_DEFAULT);
  const [masterCounts, setMasterCounts] = useState<Map<string, number>>(() => new Map());
  const [stockCounts, setStockCounts] = useState<Map<string, GroupStockCounts>>(() => new Map());
  const [avgNdByLine, setAvgNdByLine] = useState<Map<string, number>>(() => new Map());
  const [operationsPolicyByBrand, setOperationsPolicyByBrand] = useState<OperationsPolicyByBrand>(
    () => readOperationsPolicyByBrand(),
  );

  useEffect(() => {
    if (groups.length === 0) return;
    setFilters((prev) => normalizeOperationsFilters(groups, prev));
  }, [groups]);

  const patchFilters = useCallback((patch: Partial<OperationsSlicerFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const reloadOperationsData = useCallback(async () => {
    const brandNames = [...new Set(groups.map((g) => g.brandName.trim()).filter(Boolean))];
    const seq = ++reloadSeqRef.current;
    try {
      const [master, stock, avgNd] = await Promise.all([
        loadMasterGroupCountsByBrandPlatform(),
        loadOperationsStockCountsByBrandPlatform(),
        loadAvgNewDepositorByLine(brandNames),
      ]);
      if (seq !== reloadSeqRef.current) return;
      setMasterCounts(master);
      setStockCounts(stock);
      setAvgNdByLine(avgNd);
    } catch {
      if (seq !== reloadSeqRef.current) return;
      setMasterCounts(new Map());
      setStockCounts(new Map());
      setAvgNdByLine(new Map());
    }
  }, [groups]);

  useEffect(() => {
    void reloadOperationsData();
  }, [reloadOperationsData]);

  useEffect(() => {
    const onReload = () => void reloadOperationsData();
    window.addEventListener('rm-operations-reload', onReload);
    return () => window.removeEventListener('rm-operations-reload', onReload);
  }, [reloadOperationsData]);

  useEffect(() => {
    const syncPolicy = () => setOperationsPolicyByBrand(readOperationsPolicyByBrand());
    window.addEventListener('rm-operations-policy-changed', syncPolicy);
    return () => window.removeEventListener('rm-operations-policy-changed', syncPolicy);
  }, []);

  const visibleGroups = useMemo(
    () => filterOperationsBrandGroups(groups, filters),
    [groups, filters],
  );

  return (
    <div className="page-stack flex h-full min-h-0 flex-col gap-(--layout-gap)">
      <section className="content-area-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
        <header className="content-area-header shrink-0">
          <AccountSlicerBar>
            <OperationsSlicerHeader
              groups={groups}
              filters={filters}
              onChange={patchFilters}
            />
          </AccountSlicerBar>
        </header>

        <div className="content-area-body flex min-h-0 flex-1 flex-col overflow-hidden">
          <ContentNestedPanel className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
            {loading ? (
              <p className="account-sync-loading">{t('groupMonitoring.loadingAccounts')}</p>
            ) : visibleGroups.length === 0 ? (
              <div className="ticket-card-list ticket-card-list--empty account-filter-empty">
                <p className="ticket-empty-title">{t('groupMonitoring.noFilterMatch')}</p>
                <p className="ticket-empty-desc">{t('groupMonitoring.noFilterMatchDesc')}</p>
              </div>
            ) : (
              <OperationsBrandCardList
                groups={visibleGroups}
                activePlatform={filters.platform}
                masterCounts={masterCounts}
                stockCounts={stockCounts}
                avgNdByLine={avgNdByLine}
                operationsPolicyByBrand={operationsPolicyByBrand}
              />
            )}
          </ContentNestedPanel>
        </div>
      </section>
    </div>
  );
}
