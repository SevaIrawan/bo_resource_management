import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';

type EqFilter = { column: string; value: string };

export type SupabaseOrderCol = { column: string; ascending?: boolean };

/**
 * Page size for `.range()` loops.
 * Must be ≤ PostgREST `max_rows` (default 1000). Larger page + early break
 * would silently truncate when the server caps the response.
 */
export const SUPABASE_FETCH_PAGE_SIZE = 1000;

/**
 * Urutan stabil WAJIB untuk pagination — tanpa ORDER BY, Postgres/PostgREST
 * boleh mengembalikan baris beda tiap request → angka grid/stock loncat saat refresh.
 */
export function stableOrderForTable(table: string): SupabaseOrderCol[] {
  if (table === TABLES.groupsMaster) {
    return [
      { column: 'brand', ascending: true },
      { column: 'platform', ascending: true },
      { column: 'group_id', ascending: true },
    ];
  }
  if (table === TABLES.groupScrapeDaily) {
    // PK = (id, scrape_date) — wajib di ORDER BY agar halaman tidak loncat.
    return [
      { column: 'account_id', ascending: true },
      { column: 'group_id', ascending: true },
      { column: 'scrape_date', ascending: true },
      { column: 'id', ascending: true },
    ];
  }
  return [{ column: 'group_id', ascending: true }];
}

/**
 * Ambil semua baris yang cocok — loop `.range()` + `.order()` stabil sampai halaman terakhir.
 */
export async function fetchAllSupabaseRows<T extends Record<string, unknown>>(
  table: string,
  select: string,
  filters: EqFilter[],
  orderBy: SupabaseOrderCol[] = stableOrderForTable(table),
): Promise<T[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const rows: T[] = [];
  let from = 0;
  const orderCols = orderBy.length > 0 ? orderBy : stableOrderForTable(table);

  for (;;) {
    const to = from + SUPABASE_FETCH_PAGE_SIZE - 1;
    let query = supabase.from(table).select(select);
    for (const f of filters) {
      query = query.eq(f.column, f.value);
    }
    for (const o of orderCols) {
      query = query.order(o.column, { ascending: o.ascending !== false });
    }
    const { data, error } = await query.range(from, to);
    if (error) throw error;

    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < SUPABASE_FETCH_PAGE_SIZE) break;
    from += SUPABASE_FETCH_PAGE_SIZE;
  }

  return rows;
}
