import { countBrandMasterGroups } from '@/lib/brandStandardCount';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { Platform } from '@/types/database';

/** Jumlah grup di daily akun vs baris master brand (X). */
export async function isAccountAlignedWithBrandMaster(input: {
  accountId: string;
  brand: string;
  platform: Platform;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const brandX = await countBrandMasterGroups(input.brand.trim(), input.platform);
  if (brandX <= 0) return false;

  const { count: dailyCount, error } = await supabase
    .from(TABLES.groupScrapeDaily)
    .select('id', { count: 'exact', head: true })
    .eq('account_id', input.accountId);

  if (error) throw error;

  const { data: masterRows } = await supabase
    .from(TABLES.groupsMaster)
    .select('group_id')
    .eq('brand', input.brand.trim())
    .eq('platform', input.platform);

  const masterGids = new Set(
    (masterRows ?? []).map((r) => String(r.group_id).trim()).filter(Boolean),
  );

  const { data: dailyIds } = await supabase
    .from(TABLES.groupScrapeDaily)
    .select('group_id')
    .eq('account_id', input.accountId);

  const joined = (dailyIds ?? []).filter((r) =>
    masterGids.has(String(r.group_id).trim()),
  ).length;

  return joined === brandX && (dailyCount ?? 0) >= brandX;
}
