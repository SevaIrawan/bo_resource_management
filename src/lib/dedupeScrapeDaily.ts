import { normalizeGroupIdForMatch } from '@/lib/masterDailyMatch';

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

/** Satu baris per `group_id` — keep baris dengan `scraped_at` terbaru (hasil scraper terakhir). */
export function dedupeDailyRowsByGroupIdKeepLatest<
  T extends { group_id: string | null | undefined; scraped_at?: string | null },
>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const gid = String(row.group_id ?? '').trim();
    if (!gid) continue;
    const prev = map.get(gid);
    if (!prev) {
      map.set(gid, row);
      continue;
    }
    const prevAt = Date.parse(String(prev.scraped_at ?? '')) || 0;
    const rowAt = Date.parse(String(row.scraped_at ?? '')) || 0;
    if (rowAt >= prevAt) map.set(gid, row);
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
