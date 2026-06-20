export const OPERATIONS_POLICY_BY_BRAND_STORAGE_KEY = 'rm_operations_policy_by_brand';
/** Legacy — dimigrasi ke OPERATIONS_POLICY_BY_BRAND_STORAGE_KEY saat read. */
export const READY_MIN_PERCENT_BY_BRAND_STORAGE_KEY = 'rm_operations_ready_min_percent_by_brand';
export const LEGACY_READY_MIN_PERCENT_STORAGE_KEY = 'rm_operations_ready_min_percent';

export const DEFAULT_READY_MIN_PERCENT = 10;
export const MIN_READY_MIN_PERCENT = 1;
export const MAX_READY_MIN_PERCENT = 100;

export const DEFAULT_AVG_ND_WINDOW_DAYS = 30;
export const MIN_AVG_ND_WINDOW_DAYS = 7;
export const MAX_AVG_ND_WINDOW_DAYS = 90;

/** @deprecated Pakai DEFAULT_AVG_ND_WINDOW_DAYS */
export const AVG_ND_WINDOW_DAYS = DEFAULT_AVG_ND_WINDOW_DAYS;

export type ReadyMinPercentByBrand = Record<string, number>;
export type AvgNdWindowDaysByBrand = Record<string, number>;

export interface BrandOperationsPolicy {
  readyMinPercent: number;
  avgNdWindowDays: number;
}

export type OperationsPolicyByBrand = Record<string, BrandOperationsPolicy>;

export function brandPolicyKey(brandName: string): string {
  return brandName.trim();
}

export function clampReadyMinPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_READY_MIN_PERCENT;
  return Math.min(
    MAX_READY_MIN_PERCENT,
    Math.max(MIN_READY_MIN_PERCENT, Math.round(value)),
  );
}

export function clampAvgNdWindowDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AVG_ND_WINDOW_DAYS;
  return Math.min(
    MAX_AVG_ND_WINDOW_DAYS,
    Math.max(MIN_AVG_ND_WINDOW_DAYS, Math.round(value)),
  );
}

function readLegacyGlobalPercent(): number | null {
  try {
    const raw = localStorage.getItem(LEGACY_READY_MIN_PERCENT_STORAGE_KEY);
    if (raw === null) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? clampReadyMinPercent(n) : null;
  } catch {
    return null;
  }
}

function readLegacyReadyMinPercentMap(): ReadyMinPercentByBrand {
  try {
    const raw = localStorage.getItem(READY_MIN_PERCENT_BY_BRAND_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const map: ReadyMinPercentByBrand = {};
    for (const [key, value] of Object.entries(parsed)) {
      const brand = brandPolicyKey(key);
      if (!brand) continue;
      map[brand] = clampReadyMinPercent(Number(value));
    }
    return map;
  } catch {
    return {};
  }
}

function lookupBrandEntry<T>(
  map: Record<string, T>,
  brandName: string,
): T | undefined {
  const key = brandPolicyKey(brandName);
  if (!key) return undefined;
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return Object.entries(map).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
}

export function defaultBrandOperationsPolicy(): BrandOperationsPolicy {
  return {
    readyMinPercent: readLegacyGlobalPercent() ?? DEFAULT_READY_MIN_PERCENT,
    avgNdWindowDays: DEFAULT_AVG_ND_WINDOW_DAYS,
  };
}

export function readEffectiveBrandOperationsPolicy(
  brandName: string,
  map: OperationsPolicyByBrand = readOperationsPolicyByBrand(),
): BrandOperationsPolicy {
  const stored = lookupBrandEntry(map, brandName);
  if (stored) return stored;
  const legacyPercent = lookupBrandEntry(readLegacyReadyMinPercentMap(), brandName);
  return {
    readyMinPercent: legacyPercent ?? readLegacyGlobalPercent() ?? DEFAULT_READY_MIN_PERCENT,
    avgNdWindowDays: DEFAULT_AVG_ND_WINDOW_DAYS,
  };
}

export function readOperationsPolicyByBrand(): OperationsPolicyByBrand {
  try {
    const raw = localStorage.getItem(OPERATIONS_POLICY_BY_BRAND_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const map: OperationsPolicyByBrand = {};
        for (const [key, value] of Object.entries(parsed)) {
          const brand = brandPolicyKey(key);
          if (!brand || !value || typeof value !== 'object' || Array.isArray(value)) continue;
          const row = value as { readyMinPercent?: unknown; avgNdWindowDays?: unknown };
          map[brand] = {
            readyMinPercent: clampReadyMinPercent(Number(row.readyMinPercent)),
            avgNdWindowDays: clampAvgNdWindowDays(Number(row.avgNdWindowDays)),
          };
        }
        if (Object.keys(map).length > 0) return map;
      }
    }
  } catch {
    /* fall through migration */
  }

  const legacy = readLegacyReadyMinPercentMap();
  const migrated: OperationsPolicyByBrand = {};
  for (const [brand, readyMinPercent] of Object.entries(legacy)) {
    migrated[brand] = {
      readyMinPercent,
      avgNdWindowDays: DEFAULT_AVG_ND_WINDOW_DAYS,
    };
  }
  return migrated;
}

export function persistOperationsPolicyByBrand(map: OperationsPolicyByBrand): void {
  const normalized: OperationsPolicyByBrand = {};
  for (const [key, value] of Object.entries(map)) {
    const brand = brandPolicyKey(key);
    if (!brand) continue;
    normalized[brand] = {
      readyMinPercent: clampReadyMinPercent(value.readyMinPercent),
      avgNdWindowDays: clampAvgNdWindowDays(value.avgNdWindowDays),
    };
  }
  localStorage.setItem(OPERATIONS_POLICY_BY_BRAND_STORAGE_KEY, JSON.stringify(normalized));
  notifyOperationsStockPolicyChanged();
}

export function readReadyMinPercentMap(): ReadyMinPercentByBrand {
  const map = readOperationsPolicyByBrand();
  const result: ReadyMinPercentByBrand = {};
  for (const [brand, policy] of Object.entries(map)) {
    result[brand] = policy.readyMinPercent;
  }
  return result;
}

export function readAvgNdWindowDaysMap(): AvgNdWindowDaysByBrand {
  const map = readOperationsPolicyByBrand();
  const result: AvgNdWindowDaysByBrand = {};
  for (const [brand, policy] of Object.entries(map)) {
    result[brand] = policy.avgNdWindowDays;
  }
  return result;
}

export function readReadyMinPercentForBrand(
  brandName: string,
  map: OperationsPolicyByBrand = readOperationsPolicyByBrand(),
): number {
  return readEffectiveBrandOperationsPolicy(brandName, map).readyMinPercent;
}

export function readAvgNdWindowDaysForBrand(
  brandName: string,
  map: OperationsPolicyByBrand = readOperationsPolicyByBrand(),
): number {
  return readEffectiveBrandOperationsPolicy(brandName, map).avgNdWindowDays;
}

export function brandOperationsPolicyEquals(
  a: BrandOperationsPolicy,
  b: BrandOperationsPolicy,
): boolean {
  return a.readyMinPercent === b.readyMinPercent && a.avgNdWindowDays === b.avgNdWindowDays;
}

export function notifyOperationsStockPolicyChanged(): void {
  window.dispatchEvent(new Event('rm-operations-policy-changed'));
  window.dispatchEvent(new Event('rm-operations-reload'));
}

/** @deprecated */
export function readReadyMinPercent(): number {
  return readLegacyGlobalPercent() ?? DEFAULT_READY_MIN_PERCENT;
}

/** @deprecated */
export function persistReadyMinPercentForBrand(brandName: string, percent: number): void {
  const map = readOperationsPolicyByBrand();
  const brand = brandPolicyKey(brandName);
  if (!brand) return;
  const existing = readEffectiveBrandOperationsPolicy(brand, map);
  map[brand] = { ...existing, readyMinPercent: clampReadyMinPercent(percent) };
  persistOperationsPolicyByBrand(map);
}

/** @deprecated */
export function persistReadyMinPercent(percent: number): void {
  localStorage.setItem(
    LEGACY_READY_MIN_PERCENT_STORAGE_KEY,
    String(clampReadyMinPercent(percent)),
  );
  notifyOperationsStockPolicyChanged();
}
