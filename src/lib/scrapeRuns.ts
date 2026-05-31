import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { Platform, ScrapeRunStatus } from '@/types/database';

export async function startScrapeRun(input: {
  accountId: string;
  platform: Platform;
}): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLES.scrapeRuns)
    .insert({
      account_id: input.accountId,
      platform: input.platform,
      trigger_type: 'manual',
      status: 'running',
    })
    .select('id')
    .single();

  if (error) throw error;
  return data?.id as string | null;
}

export async function finishScrapeRun(input: {
  runId: string;
  status: ScrapeRunStatus;
  groupsSuccess: number;
  groupsFailed?: number;
  errorMessage?: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from(TABLES.scrapeRuns)
    .update({
      status: input.status,
      groups_total: input.groupsSuccess + (input.groupsFailed ?? 0),
      groups_success: input.groupsSuccess,
      groups_failed: input.groupsFailed ?? 0,
      completed_at: new Date().toISOString(),
      error_message: input.errorMessage ?? null,
    })
    .eq('id', input.runId);

  if (error) throw error;
}
