import { ACCOUNT_SNAPSHOT_SELECT } from '@/config/dbColumns';
import { TABLES } from '@/config/tables';
import { resolveLatestSessionUiStatus } from '@/lib/platformSessions';
import { getSupabase } from '@/lib/supabase';
import { isMisalignedFromSyncResult } from '@/lib/accountDisplayMetrics';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { AccountSnapshot, Platform } from '@/types/database';

export async function upsertAccountSnapshot(input: {
  account: AccountBrandRow;
  brandId: string;
  result: AccountSyncResult;
  brandStandard?: number;
  masterTotal?: number;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const dbSession = await resolveLatestSessionUiStatus(input.account.id);
  const effectiveSession = dbSession === 'valid' ? 'valid' : 'invalid';
  const isMisaligned = isMisalignedFromSyncResult(input.result);

  const row = {
    account_id: input.account.id,
    brand_id: input.brandId,
    platform: input.account.platform,
    status: effectiveSession === 'valid' ? 'active' : 'logout',
    session_status: effectiveSession,
    sync_state: 'synced' as const,
    groups_current: input.result.groupsCurrent,
    groups_total: input.result.groupsTotal,
    admin_current: input.result.adminCurrent,
    admin_total: input.result.adminTotal,
    is_misaligned: isMisaligned,
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from(TABLES.accountSnapshots).upsert(row, {
    onConflict: 'account_id',
  });

  if (error) throw error;
}

export async function loadAccountSnapshotsForUser(
  userId: string,
): Promise<Map<string, AccountSnapshot>> {
  const supabase = getSupabase();
  const map = new Map();
  if (!supabase) return map;

  const { data: accounts, error: accError } = await supabase
    .from(TABLES.messagingAccounts)
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (accError) throw accError;
  const ids = (accounts ?? []).map((a) => a.id as string);
  if (!ids.length) return map;

  const { data, error } = await supabase
    .from(TABLES.accountSnapshots)
    .select(ACCOUNT_SNAPSHOT_SELECT)
    .in('account_id', ids);

  if (error) throw error;

  for (const row of data ?? []) {
    map.set(row.account_id as string, row);
  }
  return map;
}

type SnapshotMetricsSource = {
  sync_state: string;
  groups_current: number;
  groups_total: number;
  admin_current: number;
  admin_total: number;
  is_misaligned: boolean;
  last_sync_at?: string | null;
};

/** Metrik kartu saja — session/status diatur oleh platform_sessions (realtime). */
export function snapshotMetricsToRowFields(
  snap: SnapshotMetricsSource,
  platform: Platform,
  brandName: string,
  label: string,
  phone: string,
): Partial<AccountBrandRow> {
  return {
    platform,
    brandName,
    accountName: label,
    phoneNumber: phone,
    syncState: snap.sync_state === 'synced' ? 'synced' : 'pending',
    groupsCurrent: snap.groups_current,
    groupsTotal: snap.groups_total,
    adminCurrent: snap.admin_current,
    adminTotal: snap.admin_total,
    isMisaligned: snap.is_misaligned,
    lastSyncAt: snap.last_sync_at ?? null,
  };
}

/** @deprecated Pakai snapshotMetricsToRowFields + session dari platform_sessions. */
export function snapshotToSyncFields(
  snap: SnapshotMetricsSource & { status: string; session_status: string },
  platform: Platform,
  brandName: string,
  label: string,
  phone: string,
): Partial<AccountBrandRow> {
  return {
    ...snapshotMetricsToRowFields(snap, platform, brandName, label, phone),
    status: snap.status === 'active' ? 'active' : 'logout',
    sessionStatus: snap.session_status === 'valid' ? 'valid' : 'invalid',
  };
}
