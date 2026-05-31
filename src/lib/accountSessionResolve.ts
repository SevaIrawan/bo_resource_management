import { TABLES } from '@/config/tables';
import { resolveMessagingAccountId } from '@/lib/accountScraper';
import {
  fetchActivePlatformSessions,
  findAccountIdBySessionData,
  hasActivePlatformSession,
} from '@/lib/platformSessions';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export interface SessionResolveDiagnostics {
  label: string;
  platform: Platform;
  supabase: boolean;
  electron: boolean;
  uiAccountId: string;
  resolvedAccountId: string;
  activeSessionRows: number;
  matchedBy: 'label_session' | 'resolve' | 'session_data' | 'none';
  supabaseError?: string;
}

/** Cari akun yang label-nya cocok DAN punya baris aktif di platform_sessions (tanpa filter user_id). */
export async function findMessagingAccountWithActiveSession(
  label: string,
  platform: Platform,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const key = label.trim().toLowerCase();
  if (!key) return null;

  const { data, error } = await supabase
    .from(TABLES.messagingAccounts)
    .select('id, label')
    .eq('platform', platform);

  if (error) {
    console.error('[session] messaging_accounts:', error.message);
    return null;
  }

  const matches = (data ?? []).filter(
    (row) => String((row as { label: string }).label).trim().toLowerCase() === key,
  );

  for (const row of matches) {
    const id = (row as { id: string }).id;
    if (await hasActivePlatformSession(id)) return id;
  }

  return null;
}

export async function diagnoseSessionResolve(input: {
  account: AccountBrandRow;
  resolvedAccountId: string;
  matchedBy: SessionResolveDiagnostics['matchedBy'];
}): Promise<SessionResolveDiagnostics> {
  const rows = await fetchActivePlatformSessions(input.resolvedAccountId);
  let supabaseError: string | undefined;
  const supabase = getSupabase();
  if (!supabase && isSupabaseConfigured()) {
    supabaseError = 'Supabase client failed to initialize';
  } else if (!isSupabaseConfigured()) {
    supabaseError = 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in .env';
  }

  return {
    label: input.account.accountName,
    platform: input.account.platform,
    supabase: isSupabaseConfigured(),
    electron: Boolean(window.electronAPI?.isElectron),
    uiAccountId: input.account.id,
    resolvedAccountId: input.resolvedAccountId,
    activeSessionRows: rows.length,
    matchedBy: input.matchedBy,
    supabaseError,
  };
}

/**
 * UUID akun untuk session/scrape — prioritas: label+NABIL+session aktif di DB.
 */
export async function resolveDbAccountForRow(input: {
  userId: string;
  account: AccountBrandRow;
}): Promise<{ accountId: string; matchedBy: SessionResolveDiagnostics['matchedBy'] }> {
  const byLabelSession = await findMessagingAccountWithActiveSession(
    input.account.accountName,
    input.account.platform,
  );
  if (byLabelSession) {
    return { accountId: byLabelSession, matchedBy: 'label_session' };
  }

  const fromSessionData = await findAccountIdBySessionData(
    input.account.id,
    input.account.platform,
  );
  if (fromSessionData && (await hasActivePlatformSession(fromSessionData))) {
    return { accountId: fromSessionData, matchedBy: 'session_data' };
  }

  const resolved = await resolveMessagingAccountId({
    userId: input.userId,
    platform: input.account.platform,
    brand: input.account.brandName,
    accName: input.account.accountName,
    phoneNumber: input.account.phoneNumber,
    localId: input.account.id,
  });

  if (await hasActivePlatformSession(resolved)) {
    return { accountId: resolved, matchedBy: 'resolve' };
  }

  const byLabelAgain = await findMessagingAccountWithActiveSession(
    input.account.accountName,
    input.account.platform,
  );
  if (byLabelAgain) {
    return { accountId: byLabelAgain, matchedBy: 'label_session' };
  }

  return { accountId: resolved, matchedBy: 'none' };
}

export function formatSessionDiagnostics(d: SessionResolveDiagnostics): string {
  const parts = [
    `akun=${d.label}`,
    `platform=${d.platform}`,
    `dbId=${d.resolvedAccountId.slice(0, 8)}…`,
    `sessionRows=${d.activeSessionRows}`,
    `via=${d.matchedBy}`,
    `electron=${d.electron ? 'yes' : 'NO'}`,
    `supabase=${d.supabase ? 'yes' : 'NO'}`,
  ];
  if (d.supabaseError) parts.push(d.supabaseError);
  return parts.join(' | ');
}
