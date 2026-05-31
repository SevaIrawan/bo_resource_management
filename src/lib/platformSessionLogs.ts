import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { LoginMethod, Platform, PlatformSessionEventType } from '@/types/database';

export async function logPlatformSessionEvent(input: {
  accountId: string;
  platform: Platform;
  eventType: PlatformSessionEventType;
  message?: string;
  loginMethod?: LoginMethod;
  platformSessionId?: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from(TABLES.platformSessionLogs).insert({
    account_id: input.accountId,
    platform_session_id: input.platformSessionId ?? null,
    platform: input.platform,
    event_type: input.eventType,
    login_method: input.loginMethod ?? null,
    message: input.message ?? null,
  });

  if (error) {
    console.warn('[platformSessionLogs]', error.message);
  }
}
