import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { LoginMethod, Platform, PlatformSessionEventType } from '@/types/database';
import type { SessionActivityStatus } from '@/lib/platformSessionLogs';

const COALESCE_STATUSES: SessionActivityStatus[] = ['logout', 'invalid'];

function statusToEventType(status: SessionActivityStatus): PlatformSessionEventType {
  if (status === 'valid') return 'sync_valid';
  if (status === 'logout') return 'device_logout';
  if (status === 'replaced') return 'session_replaced';
  return 'probe_failed';
}

async function findLatestSessionLogRow(
  accountId: string,
  sessionStatus: SessionActivityStatus,
): Promise<{ id: string } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLES.platformSessionLogs)
    .select('id')
    .eq('account_id', accountId)
    .eq('session_status', sessionStatus)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as { id: string };
}

async function touchSessionLogRow(logId: string, message?: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const now = new Date().toISOString();
  await supabase
    .from(TABLES.platformSessionLogs)
    .update({
      updated_at: now,
      message: message ?? undefined,
      metadata: { last_checked_at: now },
    })
    .eq('id', logId);
}

async function insertSessionLogRow(input: {
  accountId: string;
  platform: Platform;
  sessionStatus: SessionActivityStatus;
  eventType: PlatformSessionEventType;
  message?: string;
  loginMethod?: LoginMethod;
  platformSessionId?: string | null;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const now = new Date().toISOString();

  const { data: rpcId, error: rpcError } = await supabase.rpc('rm_log_session_activity', {
    p_account_id: input.accountId,
    p_platform_session_id: input.platformSessionId ?? null,
    p_platform: input.platform,
    p_session_status: input.sessionStatus,
    p_event_type: input.eventType,
    p_message: input.message ?? input.sessionStatus,
    p_login_method: input.loginMethod ?? null,
  });

  if (!rpcError && rpcId) return;

  const { error: insertError } = await supabase.from(TABLES.platformSessionLogs).insert({
    account_id: input.accountId,
    platform_session_id: input.platformSessionId ?? null,
    platform: input.platform,
    session_status: input.sessionStatus,
    event_type: input.eventType,
    login_method: input.loginMethod ?? null,
    message: input.message ?? input.sessionStatus,
    metadata: { recorded_at: now, last_checked_at: now, session_status: input.sessionStatus },
    updated_at: now,
  });

  if (insertError) {
    console.warn('[sessionActivity]', insertError.message);
  }
}

/**
 * Catat status session — hanya `accountId` dari DB (`resource_management_messaging_accounts`).
 */
export async function recordSessionActivityStatus(input: {
  accountId: string;
  platform: Platform;
  sessionStatus: SessionActivityStatus;
  eventType?: PlatformSessionEventType;
  message?: string;
  loginMethod?: LoginMethod;
  platformSessionId?: string | null;
}): Promise<void> {
  const eventType = input.eventType ?? statusToEventType(input.sessionStatus);

  if (COALESCE_STATUSES.includes(input.sessionStatus)) {
    const existing = await findLatestSessionLogRow(input.accountId, input.sessionStatus);
    if (existing) {
      await touchSessionLogRow(existing.id, input.message);
      return;
    }
  }

  await insertSessionLogRow({ ...input, eventType });
}
