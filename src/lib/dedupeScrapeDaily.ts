import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';

type DailyRowRef = { id: string; group_id: string; scrape_date: string; scraped_at: string };

/** In-memory: satu baris per `group_id` (untuk reconcile/metrik). */
export function dedupeDailyRowsByGroupId<T extends { group_id: string | null | undefined }>(
  rows: T[],
): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const gid = String(row.group_id ?? '').trim();
    if (!gid) continue;
    map.set(gid, row);
  }
  return [...map.values()];
}

/** Satu baris daily per `group_id` per akun — hapus duplikat historis (keep terbaru). */
export async function dedupeScrapeDailyRowsForAccount(accountId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: rows, error } = await supabase
    .from(TABLES.groupScrapeDaily)
    .select('id, group_id, scrape_date, scraped_at')
    .eq('account_id', accountId);

  if (error) throw error;
  if (!rows?.length) return;

  const bestByGid = new Map<string, DailyRowRef>();

  for (const row of rows as DailyRowRef[]) {
    const gid = String(row.group_id ?? '').trim();
    if (!gid) continue;

    const prev = bestByGid.get(gid);
    if (!prev) {
      bestByGid.set(gid, row);
      continue;
    }

    const prevAt = Date.parse(prev.scraped_at) || 0;
    const rowAt = Date.parse(row.scraped_at) || 0;
    if (rowAt >= prevAt) {
      await supabase
        .from(TABLES.groupScrapeDaily)
        .delete()
        .eq('id', prev.id)
        .eq('scrape_date', prev.scrape_date);
      bestByGid.set(gid, row);
    } else {
      await supabase
        .from(TABLES.groupScrapeDaily)
        .delete()
        .eq('id', row.id)
        .eq('scrape_date', row.scrape_date);
    }
  }
}

/** Hitung Y = jumlah `group_id` unik di daily akun. */
export async function countDistinctDailyGroupsForAccount(accountId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from(TABLES.groupScrapeDaily)
    .select('group_id')
    .eq('account_id', accountId);

  if (error) throw error;

  const gids = new Set<string>();
  for (const row of data ?? []) {
    const gid = String((row as { group_id?: string }).group_id ?? '').trim();
    if (gid) gids.add(gid);
  }
  return gids.size;
}
