import { getSupabase } from '@/lib/supabase';

type EqFilter = { column: string; value: string };

/** Ambil semua baris — satu query tanpa limit/range. */
export async function fetchAllSupabaseRows<T extends Record<string, unknown>>(
  table: string,
  select: string,
  filters: EqFilter[],
): Promise<T[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase.from(table).select(select);
  for (const f of filters) {
    query = query.eq(f.column, f.value);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as T[];
}
