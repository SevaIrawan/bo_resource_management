import type { TicketItem, TicketType } from '@/types/ticketMonitoringUi';

export function openTicketDedupeKey(
  ticketType: TicketType,
  groupId: string | null | undefined,
): string {
  const gid = String(groupId ?? '').trim();
  return gid ? `${ticketType}|${gid}` : `${ticketType}|__account__`;
}

/** Satu item UI per (type, group_id) — cadangan jika DB masih ada duplikat historis. */
export function dedupeOpenTicketItems(tickets: TicketItem[]): TicketItem[] {
  const map = new Map<string, TicketItem>();
  for (const ticket of tickets) {
    const key = openTicketDedupeKey(ticket.ticketType, ticket.groupId);
    if (!map.has(key)) {
      map.set(key, ticket);
    }
  }
  return [...map.values()];
}
