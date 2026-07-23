import {
  readEffectiveBrandOperationsPolicy,
  type OperationsPolicyByBrand,
} from '@/config/operationsStockPolicy';
import { readGroupStockCounts } from '@/lib/classifyGroupStock';
import { computeStockToPrepare } from '@/lib/computeStockToPrepare';
import { readAvgNewDepositor } from '@/lib/loadAvgNewDepositor';
import { readMasterGroupCount } from '@/lib/loadOperationsMasterCounts';
import type { GroupStockCounts, GroupStockHeaderMeta } from '@/types/groupStock';
import type { Platform } from '@/types/database';

/** Shared Avg ND + To prep meta — Account & Ops brand cards. */
export function buildStockHeaderMeta(
  brandName: string,
  platform: Platform,
  masterCounts: Map<string, number>,
  stockCounts: Map<string, GroupStockCounts>,
  avgNdByLine: Map<string, number>,
  operationsPolicyByBrand: OperationsPolicyByBrand,
): GroupStockHeaderMeta {
  const totalMasterGroups = readMasterGroupCount(masterCounts, brandName, platform);
  const readyCount = readGroupStockCounts(stockCounts, brandName, platform).ready;
  const policy = readEffectiveBrandOperationsPolicy(brandName, operationsPolicyByBrand);
  const prep = computeStockToPrepare(totalMasterGroups, readyCount, policy.readyMinPercent);

  return {
    avgNd: readAvgNewDepositor(avgNdByLine, brandName),
    stockToPrepare: prep.toPrepare,
    readyCount: prep.readyCount,
    totalMasterGroups: prep.totalMasterGroups,
    minReadyTarget: prep.minReadyTarget,
    minReadyPercent: prep.minReadyPercent,
    avgNdWindowDays: policy.avgNdWindowDays,
  };
}
