import { TABLES } from '@/config/tables';
import { logSessionLogoutActivity, logSessionValidActivity } from '@/lib/platformSessionLogs';
import { getSupabase } from '@/lib/supabase';
import type { Platform } from '@/types/database';

export type SessionUiStatus = 'valid' | 'invalid' | 'unknown';

export const PLATFORM_SESSION_RLS_HINT =
  'PLATFORM_SESSION_RLS: Run Supabase migrations 003 and 017 (or 018 on legacy DB).';

export type ActivePlatformSessionRow = {
  id: string;
  session_data: string;
  session_type: string;
  updated_at?: string;
};

/** Satu baris terbaru per akun (tracking history) — UI badge mengikuti ini. */
export type LatestPlatformSessionRow = {
  id: string;
  is_active: boolean;
  updated_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
};

/**
 * Session terbaru di DB untuk akun (ORDER BY updated_at DESC LIMIT 1).
 * Banyak baris history — jangan pakai baris lama atau maybeSingle sembarang.
 */
export async function fetchLatestPlatformSession(
  accountId: string,
): Promise<LatestPlatformSessionRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLES.platformSessions)
    .select('id, is_active, updated_at, connected_at, disconnected_at')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isRlsError(error.code, error.message)) {
      console.error('[platformSessions]', PLATFORM_SESSION_RLS_HINT, error);
    }
    return null;
  }

  if (!data) return null;
  return data as LatestPlatformSessionRow;
}

/** VALID bila masih ada baris `is_active = true` (bukan baris history terakhir by updated_at). */
export async function resolveLatestSessionUiStatus(
  accountId: string,
): Promise<'valid' | 'invalid'> {
  const active = await fetchActivePlatformSessions(accountId);
  return active.length > 0 ? 'valid' : 'invalid';
}

function isRlsError(code: string | undefined, message: string | undefined): boolean {
  if (code === '42501') return true;
  const lower = (message ?? '').toLowerCase();
  return lower.includes('row-level security') || lower.includes('rls');
}

async function deactivatePlatformSessionsRpc(
  accountId: string,
  reason: string,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase.rpc('rm_deactivate_platform_sessions', {
    p_account_id: accountId,
    p_reason: reason,
  });

  return !error;
}

/** Ambil baris session aktif terbaru — jangan pakai maybeSingle (gagal jika >1 baris aktif). */
export async function fetchActivePlatformSessions(
  accountId: string,
  options?: { sessionType?: 'telethon_string' | 'whatsapp_local_auth' },
): Promise<ActivePlatformSessionRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from(TABLES.platformSessions)
    .select('id, session_data, session_type, updated_at')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (options?.sessionType) {
    query = query.eq('session_type', options.sessionType);
  }

  const { data, error } = await query;

  if (error) {
    if (isRlsError(error.code, error.message)) {
      console.error('[platformSessions]', PLATFORM_SESSION_RLS_HINT, error);
    } else {
      console.error('[platformSessions] fetch active failed', accountId, error);
    }
    return [];
  }

  return (data as ActivePlatformSessionRow[] | null) ?? [];
}

/** Satu query untuk semua akun — hindari N× readLatestSessionUiStatus saat load grid. */
export async function fetchActiveSessionAccountIdSet(
  accountIds: string[],
): Promise<Set<string>> {
  const supabase = getSupabase();
  if (!supabase || accountIds.length === 0) return new Set();

  const unique = [...new Set(accountIds)];
  const { data, error } = await supabase
    .from(TABLES.platformSessions)
    .select('account_id')
    .in('account_id', unique)
    .eq('is_active', true);

  if (error) {
    if (isRlsError(error.code, error.message)) {
      console.error('[platformSessions]', PLATFORM_SESSION_RLS_HINT, error);
    }
    return new Set();
  }

  return new Set(
    ((data as { account_id: string }[] | null) ?? []).map((row) => row.account_id),
  );
}

async function resolvePlatformForAccount(accountId: string): Promise<Platform> {
  const supabase = getSupabase();
  if (!supabase) return 'whatsapp';
  const { data } = await supabase
    .from(TABLES.messagingAccounts)
    .select('platform')
    .eq('id', accountId)
    .maybeSingle();
  return (data?.platform as Platform) ?? 'whatsapp';
}

export async function markPlatformSessionInvalid(
  accountId: string,
  reason = 'revoked',
  platformHint?: Platform,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const rpcOk = await deactivatePlatformSessionsRpc(accountId, reason);
  if (rpcOk) return;

  const platform = platformHint ?? (await resolvePlatformForAccount(accountId));
  const activeRows = await fetchActivePlatformSessions(accountId);
  for (const row of activeRows) {
    await logSessionLogoutActivity({
      accountId,
      platform,
      reason,
      platformSessionId: row.id,
    });
  }

  const { error } = await supabase
    .from(TABLES.platformSessions)
    .update({
      is_active: false,
      disconnected_at: new Date().toISOString(),
      disconnect_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('is_active', true);

  if (error && isRlsError(error.code, error.message)) {
    throw new Error(PLATFORM_SESSION_RLS_HINT);
  }
}

export async function loadWhatsAppLocalAuthClientId(accountId: string): Promise<string | null> {
  const rows = await fetchActivePlatformSessions(accountId, {
    sessionType: 'whatsapp_local_auth',
  });
  const data = rows[0]?.session_data;
  if (!data) return null;
  return String(data).trim() || null;
}

export async function loadTelegramPlatformSession(accountId: string): Promise<string | null> {
  const rows = await fetchActivePlatformSessions(accountId);
  const telethon = rows.find((r) => r.session_type === 'telethon_string') ?? rows[0];
  if (!telethon?.session_data) return null;
  return telethon.session_data as string;
}

export async function hasActivePlatformSession(accountId: string): Promise<boolean> {
  return (await resolveLatestSessionUiStatus(accountId)) === 'valid';
}

/** Cari account_id dari session_data (LocalAuth id / acc-xxx) bila UUID UI tidak cocok. */
function sessionDataLookupKeys(sessionData: string): string[] {
  const trimmed = sessionData.trim();
  if (!trimmed) return [];
  const keys = [trimmed];
  if (trimmed.startsWith('acc-')) {
    const bare = trimmed.slice(4);
    if (bare) keys.push(bare);
  }
  return keys;
}

export async function findAccountIdBySessionData(
  sessionData: string,
  platform?: Platform,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  for (const key of sessionDataLookupKeys(sessionData)) {
    let query = supabase
      .from(TABLES.platformSessions)
      .select('account_id, session_type')
      .eq('is_active', true)
      .eq('session_data', key)
      .order('updated_at', { ascending: false })
      .limit(3);

    if (platform === 'whatsapp') {
      query = query.eq('session_type', 'whatsapp_local_auth');
    } else if (platform === 'telegram') {
      query = query.eq('session_type', 'telethon_string');
    }

    const { data, error } = await query;
    if (error || !data?.length) continue;
    const accountId = (data[0] as { account_id: string }).account_id;
    if (accountId) return accountId;
  }

  return null;
}

export async function savePlatformSession(input: {
  accountId: string;
  sessionData: string;
  sessionType: 'telethon_string' | 'whatsapp_local_auth';
  loginMethod?: 'qr' | 'phone';
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  const { data: rpcId, error: rpcError } = await supabase.rpc('rm_save_platform_session', {
    p_account_id: input.accountId,
    p_session_data: input.sessionData,
    p_session_type: input.sessionType,
    p_login_method: input.loginMethod ?? null,
  });

  if (!rpcError && rpcId) return;

  const rpcMissing =
    rpcError?.code === 'PGRST202' ||
    rpcError?.message?.toLowerCase().includes('could not find the function');

  if (!rpcMissing) {
    if (isRlsError(rpcError?.code, rpcError?.message)) {
      throw new Error(PLATFORM_SESSION_RLS_HINT);
    }
    if (rpcError) throw rpcError;
  }

  const platform = input.sessionType === 'whatsapp_local_auth' ? 'whatsapp' : 'telegram';
  await markPlatformSessionInvalid(input.accountId, 'replaced', platform);

  const { data: inserted, error } = await supabase
    .from(TABLES.platformSessions)
    .insert({
    account_id: input.accountId,
    session_data: input.sessionData,
    session_type: input.sessionType,
    login_method: input.loginMethod ?? null,
    is_active: true,
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    disconnect_reason: null,
    last_sync_at: new Date().toISOString(),
  })
    .select('id')
    .single();

  if (error) {
    if (isRlsError(error.code, error.message)) {
      throw new Error(PLATFORM_SESSION_RLS_HINT);
    }
    throw error;
  }

  const newId = (inserted as { id: string } | null)?.id;
  await logSessionValidActivity({
    accountId: input.accountId,
    platform,
    message: 'Session saved (fallback)',
    platformSessionId: newId ?? null,
  });
}

export async function saveTelegramPlatformSession(input: {
  accountId: string;
  sessionString: string;
  loginMethod?: 'qr' | 'phone';
}): Promise<void> {
  await savePlatformSession({
    accountId: input.accountId,
    sessionData: input.sessionString,
    sessionType: 'telethon_string',
    loginMethod: input.loginMethod,
  });
}

export async function saveWhatsAppPlatformSession(input: {
  accountId: string;
  localAuthClientId: string;
  loginMethod?: 'qr' | 'phone';
}): Promise<void> {
  await savePlatformSession({
    accountId: input.accountId,
    sessionData: input.localAuthClientId,
    sessionType: 'whatsapp_local_auth',
    loginMethod: input.loginMethod,
  });
}

export async function markPlatformSessionSynced(accountId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const latest = await fetchLatestPlatformSession(accountId);
  if (!latest?.is_active) return;

  const { error } = await supabase
    .from(TABLES.platformSessions)
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', latest.id);

  if (error && isRlsError(error.code, error.message)) {
    throw new Error(PLATFORM_SESSION_RLS_HINT);
  }
}
