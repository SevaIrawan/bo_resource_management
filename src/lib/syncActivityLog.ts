import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { Platform } from '@/types/database';
import type { SessionActivityStatus } from '@/lib/platformSessionLogs';

export type SyncActivitySource = 'auto' | 'manual';

const COALESCE_STATUSES: SessionActivityStatus[] = ['logout', 'invalid'];

async function findLatestSyncActivityRow(
  accountId: string,
  sessionStatus: SessionActivityStatus,
  syncSource: SyncActivitySource,
): Promise<{ id: string } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLES.syncActivityLogs)
    .select('id')
    .eq('account_id', accountId)
    .eq('session_status', sessionStatus)
    .eq('sync_source', syncSource)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as { id: string };
}

/** Catat putaran sync — `accountId` = UUID akun asli di Supabase. */
export async function recordSyncActivity(input: {
  accountId: string;
  platform: Platform;
  syncSource: SyncActivitySource;
  sessionStatus: SessionActivityStatus;
  deviceGroups: number;
  brandGroups: number;
  adminGroups: number;
  message?: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const now = new Date().toISOString();
  const payload = {
    device_groups: input.deviceGroups,
    brand_groups: input.brandGroups,
    admin_groups: input.adminGroups,
    message: input.message ?? input.sessionStatus,
    metadata: { last_checked_at: now },
    updated_at: now,
  };

  if (COALESCE_STATUSES.includes(input.sessionStatus)) {
    const existing = await findLatestSyncActivityRow(
      input.accountId,
      input.sessionStatus,
      input.syncSource,
    );
    if (existing) {
      const { error } = await supabase
        .from(TABLES.syncActivityLogs)
        .update(payload)
        .eq('id', existing.id);
      if (error) console.warn('[syncActivity]', error.message);
      return;
    }
  }

  const { error } = await supabase.from(TABLES.syncActivityLogs).insert({
    account_id: input.accountId,
    platform: input.platform,
    sync_source: input.syncSource,
    session_status: input.sessionStatus,
    ...payload,
    created_at: now,
  });

  if (error) console.warn('[syncActivity]', error.message);
}
