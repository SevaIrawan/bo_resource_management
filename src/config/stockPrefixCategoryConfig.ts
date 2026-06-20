import { notifyOperationsStockPolicyChanged } from '@/config/operationsStockPolicy';

export const STOCK_PREFIX_CONFIG_STORAGE_KEY = 'rm_operations_stock_prefix_config';

/** Prefix1 — slot user setelah brand (default * = semua user). */
export const DEFAULT_PREFIX1_USER_TOKEN = '*';
/** Prefix2 — token stock setelah brand (default NEW → Ready). */
export const DEFAULT_PREFIX2_STOCK_TOKEN = 'NEW';
/** Prefix3 — suffix customer left (default LG → Recycle). */
export const DEFAULT_PREFIX3_LEFT_SUFFIX = 'LG';

export interface StockPrefixCategoryConfig {
  prefix1UserToken: string;
  prefix2StockToken: string;
  prefix3LeftSuffix: string;
}

export function defaultStockPrefixCategoryConfig(): StockPrefixCategoryConfig {
  return {
    prefix1UserToken: DEFAULT_PREFIX1_USER_TOKEN,
    prefix2StockToken: DEFAULT_PREFIX2_STOCK_TOKEN,
    prefix3LeftSuffix: DEFAULT_PREFIX3_LEFT_SUFFIX,
  };
}

export function normalizePrefix1UserToken(value: string): string {
  const token = value.trim().replace(/\s+/g, ' ');
  return token || DEFAULT_PREFIX1_USER_TOKEN;
}

export function normalizePrefix2StockToken(value: string): string {
  const token = value.trim().replace(/\s+/g, ' ');
  return token || DEFAULT_PREFIX2_STOCK_TOKEN;
}

export function normalizePrefix3LeftSuffix(value: string): string {
  const suffix = value.trim().replace(/\s+/g, ' ');
  return suffix || DEFAULT_PREFIX3_LEFT_SUFFIX;
}

export function normalizeStockPrefixCategoryConfig(
  raw: Partial<StockPrefixCategoryConfig>,
): StockPrefixCategoryConfig {
  return {
    prefix1UserToken: normalizePrefix1UserToken(String(raw.prefix1UserToken ?? '')),
    prefix2StockToken: normalizePrefix2StockToken(String(raw.prefix2StockToken ?? '')),
    prefix3LeftSuffix: normalizePrefix3LeftSuffix(String(raw.prefix3LeftSuffix ?? '')),
  };
}

export function readStockPrefixCategoryConfig(): StockPrefixCategoryConfig {
  try {
    const raw = localStorage.getItem(STOCK_PREFIX_CONFIG_STORAGE_KEY);
    if (!raw) return defaultStockPrefixCategoryConfig();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaultStockPrefixCategoryConfig();
    }
    const row = parsed as {
      prefix1UserToken?: unknown;
      prefix2StockToken?: unknown;
      prefix3LeftSuffix?: unknown;
    };
    return normalizeStockPrefixCategoryConfig({
      prefix1UserToken: String(row.prefix1UserToken ?? ''),
      prefix2StockToken: String(row.prefix2StockToken ?? ''),
      prefix3LeftSuffix: String(row.prefix3LeftSuffix ?? ''),
    });
  } catch {
    return defaultStockPrefixCategoryConfig();
  }
}

export function persistStockPrefixCategoryConfig(config: StockPrefixCategoryConfig): void {
  localStorage.setItem(
    STOCK_PREFIX_CONFIG_STORAGE_KEY,
    JSON.stringify(normalizeStockPrefixCategoryConfig(config)),
  );
  notifyOperationsStockPolicyChanged();
}

export function stockPrefixConfigEquals(
  a: StockPrefixCategoryConfig,
  b: StockPrefixCategoryConfig,
): boolean {
  const left = normalizeStockPrefixCategoryConfig(a);
  const right = normalizeStockPrefixCategoryConfig(b);
  return (
    left.prefix1UserToken === right.prefix1UserToken &&
    left.prefix2StockToken === right.prefix2StockToken &&
    left.prefix3LeftSuffix === right.prefix3LeftSuffix
  );
}
