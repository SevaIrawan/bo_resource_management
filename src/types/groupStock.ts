/** Bucket stock grup (Operations / Account / Reporting) — bukan session akun. */
export type GroupStockBucket = 'active' | 'ready' | 'recycle' | 'review';

export interface GroupStockCounts {
  active: number;
  ready: number;
  recycle: number;
  review: number;
}

/** Fallback kosong sebelum load stock dari groups_master. */
export const EMPTY_GROUP_STOCK_COUNTS: GroupStockCounts = {
  active: 0,
  ready: 0,
  recycle: 0,
  review: 0,
};

export const GROUP_STOCK_BUCKETS: GroupStockBucket[] = [
  'active',
  'ready',
  'recycle',
  'review',
];

/** Header Account: Active disembunyikan; hanya insight aksi. */
export const ACCOUNT_HEADER_STOCK_BUCKETS: GroupStockBucket[] = [
  'ready',
  'recycle',
  'review',
];

/** Ringkasan brand di header Operations (bukan session). */
export interface GroupStockHeaderMeta {
  /** Avg ND = SUM(new_depositor) 30 hari ÷ 30 dari new_register.line. */
  avgNd: number | null;
  /** Kurang berapa grup Ready vs ambang % total master; 0 = OK. */
  stockToPrepare: number;
  readyCount: number;
  totalMasterGroups: number;
  minReadyTarget: number;
  minReadyPercent: number;
  /** Window hari Avg ND dari Admin policy brand. */
  avgNdWindowDays: number;
}

export const EMPTY_GROUP_STOCK_HEADER_META: GroupStockHeaderMeta = {
  avgNd: null,
  stockToPrepare: 0,
  readyCount: 0,
  totalMasterGroups: 0,
  minReadyTarget: 0,
  minReadyPercent: 0,
  avgNdWindowDays: 30,
};

export function formatAvgNdDisplay(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(1);
}
