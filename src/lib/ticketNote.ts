import type { TicketDetailLine } from '@/lib/ticketGroups';
import type { TicketType } from '@/types/ticketMonitoringUi';

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

/** English descriptions stored in DB (canonical). */
export const ticketDescriptionEn = {
  dailyJunk: (label: string) =>
    `On device but not in brand master (inactive/banned/broken/history): ${label}`,
  missingGroup: (label: string) => `Not joined to brand master group: ${label}`,
  notAdmin: (label: string) => `Joined but not admin: ${label}`,
  duplicateGroupId: (deviceName: string, masterName: string) =>
    `Same group ID, different name: device "${deviceName}" vs master "${masterName}"`,
  duplicateGroupName: (name: string) =>
    `Duplicate group name with different group IDs in brand master: "${name}"`,
  countMismatch: (deviceY: number, brandX: number) =>
    `Device (${deviceY}) does not match brand standard (${brandX}). Run Scraper or invite groups via export links.`,
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

function parseCountMismatch(description: string): { deviceY: number; brandX: number } | null {
  const match = description.match(/\((\d+)\)[^(]*\((\d+)\)/);
  if (!match) return null;
  return { deviceY: Number(match[1]), brandX: Number(match[2]) };
}

function lineLabel(line?: Pick<TicketDetailLine, 'groupName' | 'groupId'>): string {
  return line?.groupName?.trim() || line?.groupId?.trim() || '';
}

/** UI / export note — EN or ZH via i18n; supports legacy Indonesian rows in DB. */
export function ticketNoteForDisplay(
  t: TranslateFn,
  ticketType: TicketType,
  description: string,
  line?: Pick<TicketDetailLine, 'groupName' | 'groupId'>,
): string {
  const desc = description.trim();
  if (!desc && ticketType !== 'group_count_mismatch') {
    const label = lineLabel(line);
    if (!label) return '—';
  }

  switch (ticketType) {
    case 'daily_junk_group': {
      const label = lineLabel(line) || suffixAfterColon(desc);
      return t('groupMonitoring.ticketPanel.notes.dailyJunk', { label });
    }
    case 'missing_group': {
      const label = lineLabel(line) || suffixAfterColon(desc);
      return t('groupMonitoring.ticketPanel.notes.missingGroup', { label });
    }
    case 'not_admin': {
      const label = lineLabel(line) || suffixAfterColon(desc);
      return t('groupMonitoring.ticketPanel.notes.notAdmin', { label });
    }
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
    case 'group_count_mismatch': {
      const counts = parseCountMismatch(desc);
      if (counts) {
        return t('groupMonitoring.ticketPanel.notes.countMismatch', counts);
      }
      return t('groupMonitoring.ticketPanel.headlineCountMismatch');
    }
    default:
      return desc || '—';
  }
}
