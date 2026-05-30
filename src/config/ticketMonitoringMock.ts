import type { TicketItem } from '@/types/ticketMonitoringUi';

export const TICKET_MOCK: TicketItem[] = [
  {
    id: 't1',
    ticketType: 'missing_group',
    accent: 'danger',
    accountName: '客服-Jenny',
    platform: 'telegram',
    phoneOrUsername: '+852 9123 4567',
    brandName: 'LuxTrade',
    description: '未加入群 A · 普通客户群',
  },
  {
    id: 't2',
    ticketType: 'missing_group',
    accent: 'danger',
    accountName: '运营-001',
    platform: 'whatsapp',
    phoneOrUsername: '+60123456789',
    brandName: 'LuxTrade',
    description: '未加入群 B · VIP 客户群',
  },
  {
    id: 't3',
    ticketType: 'not_admin',
    accent: 'warning',
    accountName: 'CS-Golden',
    platform: 'whatsapp',
    phoneOrUsername: '+60111222333',
    brandName: 'GoldenBet',
    description: '群 C · 普通客户群 — 非 Admin',
  },
  {
    id: 't4',
    ticketType: 'not_admin',
    accent: 'warning',
    accountName: 'TG-Golden',
    platform: 'telegram',
    phoneOrUsername: '@GoldenBetBot',
    brandName: 'GoldenBet',
    description: '群 D · 活动推广群 — 非 Admin',
  },
];
