import { TICKET_SELECT } from '@/config/dbColumns';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { Ticket } from '@/types/database';
import type { TicketAccent, TicketItem } from '@/types/ticketMonitoringUi';

type NestedAccount = {
  label: string;
  phone_number: string | null;
};

type NestedBrand = { name: string };

type TicketRow = Ticket & {
  resource_management_messaging_accounts: NestedAccount | NestedAccount[] | null;
  resource_management_brands: NestedBrand | NestedBrand[] | null;
};

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function ticketAccent(type: Ticket['ticket_type']): TicketAccent {
  if (
    type === 'missing_group' ||
    type === 'group_count_mismatch' ||
    type === 'duplicate_group_id' ||
    type === 'duplicate_group_name' ||
    type === 'daily_junk_group'
  ) {
    return 'danger';
  }
  return 'warning';
}

function toTicketItem(row: TicketRow): TicketItem | null {
  const account = firstOrSelf(row.resource_management_messaging_accounts);
  const brand = firstOrSelf(row.resource_management_brands);
  if (!account || !brand) return null;

  return {
    id: row.id,
    accountId: row.account_id,
    ticketType: row.ticket_type,
    accent: ticketAccent(row.ticket_type),
    accountName: account.label,
    platform: row.platform,
    phoneNumber: (account.phone_number ?? '').trim(),
    brandName: brand.name,
    description: row.description,
    groupLink: row.group_link ?? null,
    groupId: row.group_id ?? null,
    groupName: row.group_name ?? null,
  };
}

/** Semua baris open ticket (detail per grup). UI pakai groupOpenTickets(). */
export async function loadOpenTicketsForUser(userId: string): Promise<TicketItem[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: accounts, error: accError } = await supabase
    .from(TABLES.messagingAccounts)
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (accError) throw accError;
  const accountIds = (accounts ?? []).map((a) => a.id as string);
  if (!accountIds.length) return [];

  const { data, error } = await supabase
    .from(TABLES.tickets)
    .select(TICKET_SELECT)
    .in('account_id', accountIds)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as TicketRow[]).map(toTicketItem).filter((t): t is TicketItem => t !== null);
}
