import {
  ACCOUNT_SNAPSHOT_SELECT,
  BRAND_SELECT,
  DAILY_GROUP_SELECT,
  MASTER_GROUP_SELECT,
  MESSAGING_ACCOUNT_SELECT,
} from '@/config/dbColumns';
import { RM_ACTIVE_TABLES, TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';

export const RM_SCHEMA_HINT =
  'SCHEMA_OUTDATED: Instal baru → 003 + 017. DB lama → 018_drop_legacy_rm.sql (sekali), lalu scrape ulang.';

function isSchemaError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('42703') ||
    lower.includes('42p01') ||
    lower.includes('does not exist') ||
    lower.includes('relation') ||
    lower.includes('phone_number') ||
    lower.includes('invite_link') ||
    lower.includes('account_id') ||
    lower.includes('brand_id')
  );
}

/** Verifikasi otomatis — semua tabel RM + kolom kritikal (tanpa perintah manual user). */
export async function assertRmSchema(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const probes: Array<{ table: string; select: string }> = [
    { table: TABLES.brands, select: BRAND_SELECT },
    { table: TABLES.messagingAccounts, select: MESSAGING_ACCOUNT_SELECT },
    { table: TABLES.platformSessions, select: 'id, account_id, is_active' },
    { table: TABLES.platformSessionLogs, select: 'id, account_id, event_type' },
    { table: TABLES.scrapeRuns, select: 'id, account_id, status' },
    { table: TABLES.groupScrapeDaily, select: DAILY_GROUP_SELECT },
    { table: TABLES.groupsMaster, select: MASTER_GROUP_SELECT },
    { table: TABLES.accountSnapshots, select: ACCOUNT_SNAPSHOT_SELECT },
    { table: TABLES.tickets, select: 'id, account_id, ticket_type, status' },
  ];

  if (probes.length !== RM_ACTIVE_TABLES.length) {
    throw new Error('RM_TABLE_CONFIG_MISMATCH');
  }

  const results = await Promise.all(
    probes.map((p) => supabase.from(p.table).select(p.select).limit(1)),
  );

  for (const result of results) {
    if (result.error && isSchemaError(result.error.message)) {
      throw new Error(RM_SCHEMA_HINT);
    }
    if (result.error) throw result.error;
  }
}
