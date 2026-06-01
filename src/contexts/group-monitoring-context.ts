import { createContext } from 'react';
import type { KpiItem } from '@/config/groupMonitoringKpis';
import type { AccountSlicerFilters } from '@/lib/filterAccountGroups';
import type { TicketSlicerFilters } from '@/lib/filterTicketSummaries';
import type { TicketSummaryGroup } from '@/lib/ticketGroups';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { TicketItem } from '@/types/ticketMonitoringUi';
import type { Dispatch, SetStateAction } from 'react';

export interface GroupMonitoringContextValue {
  groups: AccountBrandGroup[];
  filteredGroups: AccountBrandGroup[];
  accountFilters: AccountSlicerFilters;
  setAccountFilters: Dispatch<SetStateAction<AccountSlicerFilters>>;
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  /** Baris detail open ticket dari DB */
  tickets: TicketItem[];
  /** Satu kartu UI per account + brand + platform + jenis issue */
  ticketSummaries: TicketSummaryGroup[];
  /** Setelah filter slicer tab Ticket */
  filteredTicketSummaries: TicketSummaryGroup[];
  ticketFilters: TicketSlicerFilters;
  setTicketFilters: Dispatch<SetStateAction<TicketSlicerFilters>>;
  reloadTickets: () => Promise<void>;
  accountKpis: KpiItem[];
  ticketKpis: KpiItem[];
  loading: boolean;
  reportError: (message: string) => void;
  setProbeSuspendAccountIds: Dispatch<SetStateAction<string[]>>;
  /** Sembunyikan kartu brand dari area konten (session UI saja). */
  dismissBrandGroup: (groupId: string) => void;
}

export const GroupMonitoringContext = createContext<GroupMonitoringContextValue | null>(null);
