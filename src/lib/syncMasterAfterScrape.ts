import { getSupabase } from '@/lib/supabase';
import type { Platform } from '@/types/database';

/**
 * Rebuild master brand+platform dari semua daily tersisa.
 * Bukan jalur scrape — scrape pakai rm_commit_account_scrape (atomik).
 * Dipakai: removeMessagingAccountFromSlot setelah DELETE akun.
 */
export async function rebuildBrandGroupsMaster(input: {
  brand: string;
  platform: Platform;
}): Promise<{ masterInserted: number; lastSync: string }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  const { data, error } = await supabase.rpc('rm_rebuild_brand_groups_master', {
    p_brand: input.brand.trim(),
    p_platform: input.platform,
  });

  if (error) {
    throw new Error(`SCRAPER_DB_REBUILD_MASTER: ${error.message}`);
  }

  const row = (data ?? {}) as { master_inserted?: number; last_sync?: string };
  return {
    masterInserted: row.master_inserted ?? 0,
    lastSync: row.last_sync ?? new Date().toISOString(),
  };
}
