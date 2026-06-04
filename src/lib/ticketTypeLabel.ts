import type { TicketType } from '@/types/ticketMonitoringUi';

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

const TYPE_KEYS: Record<TicketType, { badge: string; export: string }> = {
  missing_group: {
    badge: 'groupMonitoring.ticketPanel.badgeMissing',
    export: 'groupMonitoring.ticketPanel.types.missingGroup',
  },
  not_admin: {
    badge: 'groupMonitoring.ticketPanel.badgeNotAdmin',
    export: 'groupMonitoring.ticketPanel.types.notAdmin',
  },
  duplicate_group_id: {
    badge: 'groupMonitoring.ticketPanel.badgeDuplicateGroupId',
    export: 'groupMonitoring.ticketPanel.types.duplicateGroupId',
  },
  duplicate_group_name: {
    badge: 'groupMonitoring.ticketPanel.badgeDuplicateGroupName',
    export: 'groupMonitoring.ticketPanel.types.duplicateGroupName',
  },
  daily_junk_group: {
    badge: 'groupMonitoring.ticketPanel.badgeDailyJunk',
    export: 'groupMonitoring.ticketPanel.types.dailyJunk',
  },
};

export function ticketTypeLabel(
  t: TranslateFn,
  ticketType: TicketType,
  variant: 'badge' | 'export' = 'badge',
): string {
  return t(TYPE_KEYS[ticketType][variant]);
}
