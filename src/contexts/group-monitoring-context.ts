import { createContext } from 'react';
import type { KpiItem } from '@/config/groupMonitoringKpis';
import type { AccountSlicerFilters } from '@/lib/filterAccountGroups';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Dispatch, SetStateAction } from 'react';

export interface GroupMonitoringContextValue {
  groups: AccountBrandGroup[];
  filteredGroups: AccountBrandGroup[];
  accountFilters: AccountSlicerFilters;
  setAccountFilters: Dispatch<SetStateAction<AccountSlicerFilters>>;
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  accountKpis: KpiItem[];
  loading: boolean;
  loadError: string | null;
  reportError: (message: string) => void;
  setProbeSuspendAccountIds: Dispatch<SetStateAction<string[]>>;
  /** Patch grid + reporting setelah daily/master berubah (scrape/realtime). */
  refreshAccountGrid: (dbAccountId: string) => Promise<void>;
}

export const GroupMonitoringContext = createContext<GroupMonitoringContextValue | null>(null);
