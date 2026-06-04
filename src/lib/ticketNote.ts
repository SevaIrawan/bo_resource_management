import type { TicketDetailLine } from '@/lib/ticketGroups';
import type { TicketType } from '@/types/ticketMonitoringUi';

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

/** English descriptions stored in DB (canonical). */
export const ticketDescriptionEn = {
  dailyJunk: (label: string) => `Extra on device, not in brand master: ${label}`,
  missingGroup: (label: string) => `In brand master, missing on account: ${label}`,
  notAdmin: (label: string) => `Joined but not admin: ${label}`,
  duplicateGroupId: (deviceName: string, masterName: string) =>
    `Same group ID, different name: device "${deviceName}" vs master "${masterName}"`,
  duplicateGroupName: (name: string) =>
    `Same group name in master with different IDs: "${name}"`,
};

function suffixAfterColon(description: string): string {
  const idx = description.indexOf(':');
  if (idx < 0) return description.trim();
  return description.slice(idx + 1).trim();
}

function parseQuotedPair(description: string): { deviceName: string; masterName: string } | null {
  const match = description.match(/device\s+"([^"]*)"\s+vs\s+master\s+"([^"]*)"/i);
  if (!match) return null;
  return { deviceName: match[1], masterName: match[2] };
}

function parseDuplicateName(description: string): string | null {
  const quoted = description.match(/"([^"]+)"\s*$/);
  if (quoted) return quoted[1];
  return suffixAfterColon(description) || null;
}

function lineLabel(line?: Pick<TicketDetailLine, 'groupName' | 'groupId'>): string {
  return line?.groupName?.trim() || line?.groupId?.trim() || '';
}

/** UI / export note — EN or ZH via i18n. */
export function ticketNoteForDisplay(
  t: TranslateFn,
  ticketType: TicketType,
  description: string,
  line?: Pick<TicketDetailLine, 'groupName' | 'groupId'>,
): string {
  const desc = description.trim();
  const label = lineLabel(line) || suffixAfterColon(desc);

  switch (ticketType) {
    case 'daily_junk_group':
      return t('groupMonitoring.ticketPanel.notes.dailyJunk', { label: label || '—' });
    case 'missing_group':
      return t('groupMonitoring.ticketPanel.notes.missingGroup', { label: label || '—' });
    case 'not_admin':
      return t('groupMonitoring.ticketPanel.notes.notAdmin', { label: label || '—' });
    case 'duplicate_group_id': {
      const pair = parseQuotedPair(desc);
      if (pair) {
        return t('groupMonitoring.ticketPanel.notes.duplicateGroupId', pair);
      }
      return desc || '—';
    }
    case 'duplicate_group_name': {
      const name = parseDuplicateName(desc);
      if (name) {
        return t('groupMonitoring.ticketPanel.notes.duplicateGroupName', { name });
      }
      return desc || '—';
    }
    default:
      return desc || '—';
  }
}
