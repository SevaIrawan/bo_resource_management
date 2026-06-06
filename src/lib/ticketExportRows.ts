import type { TicketDetailLine, TicketSummaryGroup } from '@/lib/ticketGroups';

export interface TicketExportRow {
  'Issue ID': string;
  '#': number;
  Account: string;
  Brand: string;
  Platform: string;
  Phone: string;
  'Issue type': string;
  'Group name': string;
  'Group ID': string;
  'Invite link': string;
  Note: string;
}

function platformLabel(platform: TicketSummaryGroup['platform']): string {
  return platform === 'whatsapp' ? 'WhatsApp' : 'Telegram';
}

function cell(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : '—';
}

/** Satu baris per grup/ticket detail — dipakai export Excel & modal tabel. */
export function ticketGroupToExportRows(
  group: TicketSummaryGroup,
  issueTypeLabel: string,
  formatNote?: (line: TicketDetailLine) => string,
): TicketExportRow[] {
  return group.lines.map((line, index) => ({
    'Issue ID': group.issueId,
    '#': index + 1,
    Account: group.accountName,
    Brand: group.brandName,
    Platform: platformLabel(group.platform),
    Phone: group.phoneNumber,
    'Issue type': issueTypeLabel,
    'Group name': cell(line.groupName),
    'Group ID': cell(line.groupId),
    'Invite link': cell(line.groupLink),
    Note: formatNote ? formatNote(line) : '—',
  }));
}

export const TICKET_EXPORT_COLUMNS: (keyof TicketExportRow)[] = [
  'Issue ID',
  '#',
  'Account',
  'Brand',
  'Platform',
  'Phone',
  'Issue type',
  'Group name',
  'Group ID',
  'Invite link',
  'Note',
];

/** Kolom tabel popup detail — tanpa Note / caption deskriptif. */
export const TICKET_DETAIL_MODAL_COLUMNS: (keyof TicketExportRow)[] = [
  '#',
  'Group name',
  'Group ID',
  'Invite link',
];
