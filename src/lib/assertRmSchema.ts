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
  'SCHEMA_OUTDATED: Instal baru → 003 + 017 + 020 + 023 + 026 + 030. DB lama → 018 (sekali) + 020 + 023 + 026 + 030.';

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
    lower.includes('brand_id') ||
    lower.includes('session_status') ||
    lower.includes('sync_source')
  );
}

/** Verifikasi tabel/kolom RM sekali saat load — tanpa RPC probe, tanpa UUID palsu. */
export async function assertRmSchema(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const probes: Array<{ table: string; select: string }> = [
    { table: TABLES.brands, select: BRAND_SELECT },
    { table: TABLES.messagingAccounts, select: MESSAGING_ACCOUNT_SELECT },
    { table: TABLES.platformSessions, select: 'id, account_id, is_active' },
    {
      table: TABLES.platformSessionLogs,
      select: 'id, account_id, event_type, session_status, updated_at',
    },
    { table: TABLES.syncActivityLogs, select: 'id, account_id, sync_source, session_status' },
    { table: TABLES.scrapeRuns, select: 'id, account_id, status' },
    { table: TABLES.groupScrapeDaily, select: DAILY_GROUP_SELECT },
    { table: TABLES.groupsMaster, select: MASTER_GROUP_SELECT },
    { table: TABLES.accountSnapshots, select: ACCOUNT_SNAPSHOT_SELECT },
    { table: TABLES.tickets, select: 'id, account_id, ticket_type, status' },
    {
      table: TABLES.ticketIssueHandles,
      select: 'issue_id, account_id, task_status, start_task, end_task, remark',
    },
  ];

  if (probes.length !== RM_ACTIVE_TABLES.length) {
    throw new Error('RM_TABLE_CONFIG_MISMATCH');
  }

  const results = await Promise.all(
    probes.map((p) => supabase.from(p.table).select(p.select).limit(1)),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const probe = probes[i];
    if (!result.error) continue;
    if (isSchemaError(result.error.message)) {
      throw new Error(`${RM_SCHEMA_HINT} (${probe.table}: ${result.error.message})`);
    }
    throw new Error(`${probe.table}: ${result.error.message}`);
  }
}
