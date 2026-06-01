import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { TicketSummaryGroup } from '@/lib/ticketGroups';
import {
  DEFAULT_TICKET_PROCESS_RECORD,
  TICKET_TASK_STATUSES,
  type TicketProcessRecord,
  type TicketTaskStatus,
} from '@/lib/ticketWorkflowLocal';
import type { Platform } from '@/types/database';
import type { TicketType } from '@/types/ticketMonitoringUi';

type HandleRow = {
  issue_id: string;
  account_id: string;
  brand_name: string;
  platform: Platform;
  ticket_type: TicketType;
  task_status: TicketTaskStatus;
  start_task: string | null;
  end_task: string | null;
  remark: string | null;
};

function rowToRecord(row: HandleRow): TicketProcessRecord {
  return {
    taskStatus: TICKET_TASK_STATUSES.includes(row.task_status) ? row.task_status : 'todo',
    startTask: row.start_task ?? '',
    endTask: row.end_task ?? '',
    remark: row.remark ?? '',
  };
}

export async function loadIssueHandlesForAccounts(
  accountIds: string[],
): Promise<Record<string, TicketProcessRecord>> {
  const supabase = getSupabase();
  if (!supabase || accountIds.length === 0) return {};

  const { data, error } = await supabase
    .from(TABLES.ticketIssueHandles)
    .select(
      'issue_id, account_id, brand_name, platform, ticket_type, task_status, start_task, end_task, remark',
    )
    .in('account_id', accountIds);

  if (error) throw error;

  const map: Record<string, TicketProcessRecord> = {};
  for (const row of (data ?? []) as HandleRow[]) {
    map[row.issue_id] = rowToRecord(row);
  }
  return map;
}

export async function upsertIssueHandle(
  group: Pick<
    TicketSummaryGroup,
    'issueId' | 'accountId' | 'brandName' | 'platform' | 'ticketType'
  >,
  record: TicketProcessRecord,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  const { error } = await supabase.from(TABLES.ticketIssueHandles).upsert(
    {
      issue_id: group.issueId,
      account_id: group.accountId,
      brand_name: group.brandName,
      platform: group.platform,
      ticket_type: group.ticketType,
      task_status: record.taskStatus,
      start_task: record.startTask || null,
      end_task: record.endTask || null,
      remark: record.remark,
    },
    { onConflict: 'issue_id' },
  );

  if (error) throw error;
}

/**
 * Issue masih open di DB (scrape/reconcile) dengan `issue_id` sama, tetapi handle masih Complete
 * → reset task baru (To Do, tanggal/remark kosong).
 */
export async function resetReopenedCompletedHandles(
  openSummaries: TicketSummaryGroup[],
  handles: Record<string, TicketProcessRecord>,
): Promise<Record<string, TicketProcessRecord>> {
  const next = { ...handles };
  const toReset = openSummaries.filter(
    (group) => next[group.issueId]?.taskStatus === 'complete',
  );

  if (toReset.length === 0) return next;

  await Promise.all(
    toReset.map(async (group) => {
      next[group.issueId] = { ...DEFAULT_TICKET_PROCESS_RECORD };
      await upsertIssueHandle(group, DEFAULT_TICKET_PROCESS_RECORD);
    }),
  );

  return next;
}
