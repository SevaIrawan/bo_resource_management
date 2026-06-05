import { normalizeGroupIdForMatch } from '@/lib/masterDailyMatch';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';

type DailyRowRef = { id: string; group_id: string; scrape_date: string; scraped_at: string };

/** In-memory: satu baris per `group_id` raw (legacy). */
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

/** Satu baris per group_id normalisasi — selaras RPC rm_norm_group_id & ticket gap. */
export function dedupeDailyRowsByNormalizedGroupId<
  T extends { group_id: string | null | undefined },
>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const norm = normalizeGroupIdForMatch(String(row.group_id ?? '').trim());
    if (!norm) continue;
    map.set(norm, row);
  }
  return [...map.values()];
}

/** Satu baris daily per `group_id` per akun — hapus duplikat historis (keep terbaru). */
export async function dedupeScrapeDailyRowsForAccount(accountId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const rows = await fetchAllSupabaseRows<DailyRowRef>(
    TABLES.groupScrapeDaily,
    'id, group_id, scrape_date, scraped_at',
    [{ column: 'account_id', value: accountId }],
  );
  if (!rows.length) return;

  const bestByGid = new Map<string, DailyRowRef>();

  for (const row of rows) {
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

  const data = await fetchAllSupabaseRows<{ group_id: string }>(
    TABLES.groupScrapeDaily,
    'group_id',
    [{ column: 'account_id', value: accountId }],
  );

  const gids = new Set<string>();
  for (const row of data) {
    const gid = String((row as { group_id?: string }).group_id ?? '').trim();
    if (gid) gids.add(gid);
  }
  return gids.size;
}
