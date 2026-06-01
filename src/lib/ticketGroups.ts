import { buildTicketIssueId } from '@/lib/ticketIssueId';
import type { Platform } from '@/types/database';
import type { TicketAccent, TicketItem, TicketType } from '@/types/ticketMonitoringUi';

export interface TicketDetailLine {
  id: string;
  groupId: string | null;
  groupName: string | null;
  groupLink: string | null;
  description: string;
}

export interface TicketSummaryGroup {
  /** Kunci internal grouping (accountId|brand|platform|type). */
  key: string;
  accountId: string;
  /** ID topik issue di UI — satu per kartu summary. */
  issueId: string;
  ticketType: TicketType;
  accent: TicketAccent;
  accountName: string;
  brandName: string;
  platform: Platform;
  phoneNumber: string;
  itemCount: number;
  lines: TicketDetailLine[];
}

export function ticketGroupKey(
  ticket: Pick<TicketItem, 'accountId' | 'brandName' | 'platform' | 'ticketType'>,
): string {
  return [ticket.accountId, ticket.brandName.trim(), ticket.platform, ticket.ticketType].join('|');
}

export function groupOpenTickets(tickets: TicketItem[]): TicketSummaryGroup[] {
  const map = new Map<string, TicketSummaryGroup>();

  for (const ticket of tickets) {
    const key = ticketGroupKey(ticket);
    let group = map.get(key);

    if (!group) {
      group = {
        key,
        accountId: ticket.accountId,
        issueId: buildTicketIssueId({
          accountId: ticket.accountId,
          brandName: ticket.brandName,
          platform: ticket.platform,
          ticketType: ticket.ticketType,
        }),
        ticketType: ticket.ticketType,
        accent: ticket.accent,
        accountName: ticket.accountName,
        brandName: ticket.brandName,
        platform: ticket.platform,
        phoneNumber: ticket.phoneNumber,
        itemCount: 0,
        lines: [],
      };
      map.set(key, group);
    }

    const lineKey = [
      ticket.groupId?.trim() || '',
      ticket.groupName?.trim().toLowerCase() || '',
      ticket.description,
    ].join('|');
    const alreadyListed = group.lines.some(
      (line) =>
        [
          line.groupId?.trim() || '',
          line.groupName?.trim().toLowerCase() || '',
          line.description,
        ].join('|') === lineKey,
    );
    if (!alreadyListed) {
      group.lines.push({
        id: ticket.id,
        groupId: ticket.groupId ?? null,
        groupName: ticket.groupName ?? null,
        groupLink: ticket.groupLink ?? null,
        description: ticket.description,
      });
    }
    group.itemCount = group.lines.length;
  }

  return [...map.values()].sort((a, b) => {
    const brand = a.brandName.localeCompare(b.brandName);
    if (brand !== 0) return brand;
    const acc = a.accountName.localeCompare(b.accountName);
    if (acc !== 0) return acc;
    return a.ticketType.localeCompare(b.ticketType);
  });
}

export function ticketTypeExportLabel(type: TicketType): string {
  const labels: Record<TicketType, string> = {
    missing_group: 'Missing group',
    not_admin: 'Not admin',
    group_count_mismatch: 'Group count mismatch',
    duplicate_group_id: 'Duplicate group ID',
    duplicate_group_name: 'Duplicate group name',
    daily_junk_group: 'Device junk group',
  };
  return labels[type];
}
