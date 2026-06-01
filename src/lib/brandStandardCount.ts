import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { Brand } from '@/types/database';
import type { Platform } from '@/types/database';

const META_KEY = 'standard_group_count_by_platform';

export type BrandStandardByPlatform = Partial<Record<Platform, number>>;

export function brandPlatformCacheKey(brandId: string, platform: Platform): string {
  return `${brandId}:${platform}`;
}

export function readStoredPlatformStandard(
  brand: Pick<Brand, 'metadata' | 'standard_group_count'>,
  platform: Platform,
): number {
  const meta = brand.metadata as Record<string, unknown> | null;
  const byPlatform = meta?.[META_KEY] as BrandStandardByPlatform | undefined;
  const fromMeta = byPlatform?.[platform];
  if (typeof fromMeta === 'number' && fromMeta >= 0) return fromMeta;
  return 0;
}

/** X = jumlah baris master brand + platform (grup valid dengan link resmi). */
export async function countBrandMasterGroups(
  brandName: string,
  platform: Platform,
): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from(TABLES.groupsMaster)
    .select('id', { count: 'exact', head: true })
    .eq('brand', brandName.trim())
    .eq('platform', platform);

  if (error) throw error;
  return count ?? 0;
}

export async function resolveBrandNameFromId(brandId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLES.brands)
    .select('name')
    .eq('id', brandId)
    .maybeSingle();

  if (error) throw error;
  return (data?.name as string | undefined)?.trim() ?? null;
}

/**
 * X untuk satu brand + satu platform (WA ≠ TG).
 */
/** X = hitung master table brand + platform; kosong → 0 (tanpa fallback metadata/UI). */
export async function resolveBrandStandardTotal(
  brandId: string,
  platform: Platform,
  _storedPlatformCount = 0,
  brandName?: string,
): Promise<number> {
  const name = brandName?.trim() || (await resolveBrandNameFromId(brandId));
  if (!name) return 0;
  return countBrandMasterGroups(name, platform);
}

export async function fetchBrandStandardTotalsByPlatform(
  brands: Pick<Brand, 'id' | 'name' | 'metadata' | 'standard_group_count'>[],
  platformsByBrand: Map<string, Platform[]>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  await Promise.all(
    brands.flatMap((brand) => {
      const platforms = platformsByBrand.get(brand.id) ?? [];
      return platforms.map(async (platform) => {
        const total = await resolveBrandStandardTotal(
          brand.id,
          platform,
          readStoredPlatformStandard(brand, platform),
          brand.name,
        );
        map.set(brandPlatformCacheKey(brand.id, platform), total);
      });
    }),
  );

  return map;
}

/** Setelah scrape — simpan X per platform di brands.metadata. */
export async function persistBrandStandardCount(
  brandId: string,
  platform: Platform,
  brandName?: string,
): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const name = brandName?.trim() || (await resolveBrandNameFromId(brandId));
  if (!name) return 0;

  const next = await countBrandMasterGroups(name, platform);
  if (next <= 0) return 0;

  const { data: brand, error: loadError } = await supabase
    .from(TABLES.brands)
    .select('metadata')
    .eq('id', brandId)
    .maybeSingle();

  if (loadError) throw loadError;

  const meta = { ...((brand?.metadata as Record<string, unknown>) ?? {}) };
  const byPlatform: BrandStandardByPlatform = {
    ...((meta[META_KEY] as BrandStandardByPlatform) ?? {}),
    [platform]: next,
  };
  meta[META_KEY] = byPlatform;

  const { error } = await supabase
    .from(TABLES.brands)
    .update({ metadata: meta, updated_at: new Date().toISOString() })
    .eq('id', brandId);

  if (error) throw error;
  return next;
}

export function buildStandardCountByPlatformFromRows(
  accounts: { platform: Platform; groupsTotal: number }[],
): BrandStandardByPlatform {
  const out: BrandStandardByPlatform = {};
  for (const row of accounts) {
    const x = row.groupsTotal;
    if (x <= 0) continue;
    out[row.platform] = Math.max(out[row.platform] ?? 0, x);
  }
  return out;
}
