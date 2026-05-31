import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';

export type SessionUiStatus = 'valid' | 'invalid' | 'unknown';

export const PLATFORM_SESSION_RLS_HINT =
  'PLATFORM_SESSION_RLS: Run Supabase migrations 003 and 017 (or 018 on legacy DB).';

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

export async function markPlatformSessionInvalid(accountId: string, reason = 'revoked'): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const rpcOk = await deactivatePlatformSessionsRpc(accountId, reason);
  if (rpcOk) return;

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
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLES.platformSessions)
    .select('session_data')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .eq('session_type', 'whatsapp_local_auth')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.session_data) return null;
  return String(data.session_data).trim() || null;
}

export async function loadTelegramPlatformSession(accountId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLES.platformSessions)
    .select('session_data')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.session_data) return null;
  return data.session_data as string;
}

export async function hasActivePlatformSession(accountId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data } = await supabase
    .from(TABLES.platformSessions)
    .select('id')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return Boolean(data?.id);
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

  await markPlatformSessionInvalid(input.accountId, 'replaced');

  const { error } = await supabase.from(TABLES.platformSessions).insert({
    account_id: input.accountId,
    session_data: input.sessionData,
    session_type: input.sessionType,
    login_method: input.loginMethod ?? null,
    is_active: true,
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    disconnect_reason: null,
    last_sync_at: new Date().toISOString(),
  });

  if (error) {
    if (isRlsError(error.code, error.message)) {
      throw new Error(PLATFORM_SESSION_RLS_HINT);
    }
    throw error;
  }
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

  const { error } = await supabase
    .from(TABLES.platformSessions)
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('is_active', true);

  if (error && isRlsError(error.code, error.message)) {
    throw new Error(PLATFORM_SESSION_RLS_HINT);
  }
}
