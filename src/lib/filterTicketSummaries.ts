import type { TicketSummaryGroup } from '@/lib/ticketGroups';
import {
  ticketMatchesWorkflowBookmark,
  type TicketWorkflowBookmark,
} from '@/lib/ticketWorkflowLocal';
import type { Platform } from '@/types/database';
import type { TicketType } from '@/types/ticketMonitoringUi';

export interface TicketSlicerFilters {
  brand: string;
  platform: string;
  ticketType: string;
  search: string;
  /** Bookmark kanan: In Progress | Completed (sama pola Card view | Table view). */
  workflowBookmark: TicketWorkflowBookmark;
}

export const TICKET_FILTER_DEFAULT: TicketSlicerFilters = {
  brand: 'all',
  platform: 'all',
  ticketType: 'all',
  search: '',
  workflowBookmark: 'in_progress',
};

export function filterTicketSummaries(
  summaries: TicketSummaryGroup[],
  filters: TicketSlicerFilters,
): TicketSummaryGroup[] {
  const q = filters.search.trim().toLowerCase();

  return summaries.filter((group) => {
    if (!ticketMatchesWorkflowBookmark(group.issueId, filters.workflowBookmark)) {
      return false;
    }

    if (filters.brand !== 'all' && group.brandName !== filters.brand) return false;
    if (filters.platform !== 'all' && group.platform !== filters.platform) return false;
    if (filters.ticketType !== 'all' && group.ticketType !== (filters.ticketType as TicketType)) {
      return false;
    }
    if (!q) return true;

    const haystack = [
      group.accountName,
      group.brandName,
      group.phoneNumber,
      group.ticketType,
      ...group.lines.map((l) => [l.groupName, l.groupId, l.description, l.groupLink].join(' ')),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}

export function uniqueTicketBrands(summaries: TicketSummaryGroup[]): string[] {
  return [...new Set(summaries.map((s) => s.brandName))].sort((a, b) => a.localeCompare(b));
}

export function uniqueTicketPlatforms(summaries: TicketSummaryGroup[]): Platform[] {
  const set = new Set<Platform>();
  for (const summary of summaries) {
    set.add(summary.platform);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
