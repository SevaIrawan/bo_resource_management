import { DEFAULT_READY_MIN_PERCENT } from '@/config/operationsStockPolicy';

export interface StockToPrepareResult {
  /** Kurang berapa grup Ready vs ambang; 0 = OK. */
  toPrepare: number;
  /** Target minimum jumlah grup Ready (ceil dari % × total). */
  minReadyTarget: number;
  /** Persentase ambang yang dipakai. */
  minReadyPercent: number;
  readyCount: number;
  totalMasterGroups: number;
}

/** To prep = max(0, ceil(total × pct/100) − ready). */
export function computeStockToPrepare(
  totalMasterGroups: number,
  readyCount: number,
  minReadyPercent: number = DEFAULT_READY_MIN_PERCENT,
): StockToPrepareResult {
  const pct = Number.isFinite(minReadyPercent) ? minReadyPercent : DEFAULT_READY_MIN_PERCENT;
  const total = Math.max(0, Math.floor(Number(totalMasterGroups) || 0));
  const ready = Math.max(0, Math.floor(Number(readyCount) || 0));

  if (total <= 0 || pct <= 0) {
    return {
      toPrepare: 0,
      minReadyTarget: 0,
      minReadyPercent: pct,
      readyCount: ready,
      totalMasterGroups: total,
    };
  }

  const minReadyTarget = Math.ceil((total * pct) / 100);
  const toPrepare = Math.max(0, minReadyTarget - ready);

  return {
    toPrepare,
    minReadyTarget,
    minReadyPercent: pct,
    readyCount: ready,
    totalMasterGroups: total,
  };
}
