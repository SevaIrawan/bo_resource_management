import type { Platform } from '@/types/database';
import type { TicketType } from '@/types/ticketMonitoringUi';

const TYPE_CODE: Record<TicketType, string> = {
  missing_group: 'MG',
  not_admin: 'NA',
  group_count_mismatch: 'CM',
  duplicate_group_id: 'DI',
  duplicate_group_name: 'DN',
  daily_junk_group: 'JK',
};

/**
 * ID topik issue di UI — stabil per akun + brand + platform + jenis ticket.
 * Satu kartu summary = satu `issueId` (bukan UUID baris detail DB).
 */
export function buildTicketIssueId(input: {
  accountId: string;
  brandName: string;
  platform: Platform;
  ticketType: TicketType;
}): string {
  const acc = input.accountId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const brand = input.brandName
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
    .toUpperCase() || 'BRAND';
  const plat = input.platform === 'whatsapp' ? 'WA' : 'TG';
  return `ISS-${brand}-${plat}-${acc}-${TYPE_CODE[input.ticketType]}`;
}
