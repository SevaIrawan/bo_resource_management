import type { Platform } from '@/types/database';

export type TicketType = 'missing_group' | 'not_admin';

export type TicketAccent = 'danger' | 'warning';

export interface TicketItem {
  id: string;
  ticketType: TicketType;
  accent: TicketAccent;
  accountName: string;
  platform: Platform;
  phoneOrUsername: string;
  brandName: string;
  description: string;
  groupLink?: string;
}
