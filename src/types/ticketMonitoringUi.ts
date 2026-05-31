import type { Platform } from '@/types/database';

export type TicketType =
  | 'missing_group'
  | 'not_admin'
  | 'group_count_mismatch'
  | 'duplicate_group_id'
  | 'duplicate_group_name'
  | 'daily_junk_group';

export type TicketAccent = 'danger' | 'warning';

/** Satu baris detail di DB (open ticket). */
export interface TicketItem {
  id: string;
  ticketType: TicketType;
  accent: TicketAccent;
  accountName: string;
  platform: Platform;
  phoneNumber: string;
  brandName: string;
  description: string;
  groupLink?: string | null;
  groupId?: string | null;
  groupName?: string | null;
}
