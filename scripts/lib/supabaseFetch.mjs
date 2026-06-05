/** Fetch semua baris — satu query, tanpa range/limit (Supabase org tanpa cap). */
export async function fetchAllRows(supabase, table, select, filters) {
  let query = supabase.from(table).select(select);
  for (const { column, value } of filters) {
    query = query.eq(column, value);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
