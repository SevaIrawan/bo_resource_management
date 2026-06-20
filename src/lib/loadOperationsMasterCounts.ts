import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import type { Platform } from '@/types/database';

/** Kunci map: `{brand}:{platform}` — brand = trim(groups_master.brand). */
export function masterCountMapKey(brandName: string, platform: Platform): string {
  return `${brandName.trim()}:${platform}`;
}

/**
 * Hitung jumlah group_id unik per brand+platform langsung dari groups_master.
 * Sumber kebenaran badge Operations (bukan cache grid Account).
 */
export async function loadMasterGroupCountsByBrandPlatform(): Promise<Map<string, number>> {
  const rows = await fetchAllSupabaseRows<{
    brand: string;
    platform: Platform;
    group_id: string;
  }>(TABLES.groupsMaster, 'brand, platform, group_id', []);

  const uniqueByKey = new Map<string, Set<string>>();

  for (const row of rows) {
    const brand = String(row.brand ?? '').trim();
    const platform = row.platform;
    const groupId = String(row.group_id ?? '').trim();
    if (!brand || !groupId || (platform !== 'whatsapp' && platform !== 'telegram')) continue;

    const key = masterCountMapKey(brand, platform);
    let set = uniqueByKey.get(key);
    if (!set) {
      set = new Set<string>();
      uniqueByKey.set(key, set);
    }
    set.add(groupId);
  }

  const counts = new Map<string, number>();
  for (const [key, set] of uniqueByKey) {
    counts.set(key, set.size);
  }
  return counts;
}

/** Lookup count; brand name case-sensitive match ke DB master. */
export function readMasterGroupCount(
  counts: Map<string, number>,
  brandName: string,
  platform: Platform,
): number {
  return counts.get(masterCountMapKey(brandName, platform)) ?? 0;
}
