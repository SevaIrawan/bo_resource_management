import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';

function mergeLatest(map: Map<string, string>, accountId: string, iso: string | null | undefined) {
  if (!accountId || !iso) return;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return;
  const prev = map.get(accountId);
  if (!prev || ms > Date.parse(prev)) {
    map.set(accountId, iso);
  }
}

/**
 * Waktu aktivitas terakhir per akun dari DB (bukan stamp statis di snapshot).
 * Sumber: scrape_runs.completed_at, group_scrape_daily.scraped_at, sync_activity (valid).
 */
export async function fetchLastActivityAtByAccount(
  accountIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (accountIds.length === 0) return result;

  const supabase = getSupabase();
  if (!supabase) return result;

  const unique = [...new Set(accountIds)];

  const [runsRes, dailyRes, syncRes] = await Promise.all([
    supabase
      .from(TABLES.scrapeRuns)
      .select('account_id, completed_at')
      .in('account_id', unique)
      .in('status', ['completed', 'partial'])
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1000),
    supabase
      .from(TABLES.groupScrapeDaily)
      .select('account_id, scraped_at')
      .in('account_id', unique)
      .order('scraped_at', { ascending: false })
      .limit(5000),
    supabase
      .from(TABLES.syncActivityLogs)
      .select('account_id, updated_at, created_at')
      .in('account_id', unique)
      .eq('session_status', 'valid')
      .order('updated_at', { ascending: false })
      .limit(1000),
  ]);

  for (const row of runsRes.data ?? []) {
    mergeLatest(result, row.account_id as string, row.completed_at as string);
  }
  for (const row of dailyRes.data ?? []) {
    mergeLatest(result, row.account_id as string, row.scraped_at as string);
  }
  for (const row of syncRes.data ?? []) {
    const at = (row.updated_at ?? row.created_at) as string;
    mergeLatest(result, row.account_id as string, at);
  }

  return result;
}
