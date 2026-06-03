import type {
  AccountBrandGroup,
  AccountBrandRow,
  AccountConnectionStatus,
} from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export interface AccountSlicerFilters {
  brand: string;
  platform: string;
  status: string;
  search: string;
}

export const ACCOUNT_FILTER_DEFAULT: AccountSlicerFilters = {
  brand: 'all',
  platform: 'all',
  status: 'all',
  search: '',
};

export function uniqueAccountBrands(groups: AccountBrandGroup[]): string[] {
  return [...new Set(groups.map((g) => g.brandName))].sort((a, b) => a.localeCompare(b));
}

export function uniqueAccountPlatforms(groups: AccountBrandGroup[]): Platform[] {
  const set = new Set<Platform>();
  for (const group of groups) {
    for (const row of group.accounts) {
      set.add(row.platform);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function uniqueAccountStatuses(groups: AccountBrandGroup[]): AccountConnectionStatus[] {
  const set = new Set<AccountConnectionStatus>();
  for (const group of groups) {
    for (const row of group.accounts) {
      set.add(row.status);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function brandNameMatchesSearch(group: AccountBrandGroup, query: string): boolean {
  return group.brandName.trim().toLowerCase().includes(query);
}

function rowMatchesSearch(row: AccountBrandRow, group: AccountBrandGroup, query: string): boolean {
  const haystack = [
    row.accountName,
    row.phoneNumber,
    group.brandName,
    row.platform,
    row.status,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function filterAccountGroups(
  groups: AccountBrandGroup[],
  filters: AccountSlicerFilters,
): AccountBrandGroup[] {
  const q = filters.search.trim().toLowerCase();

  return groups
    .filter((group) => {
      if (filters.brand !== 'all' && group.brandName !== filters.brand) return false;
      if (!q) return true;
      if (brandNameMatchesSearch(group, q)) return true;
      return group.accounts.some((row) => rowMatchesSearch(row, group, q));
    })
    .map((group) => {
      const accounts = group.accounts.filter((row) => {
        if (filters.platform !== 'all' && row.platform !== filters.platform) return false;
        if (filters.status !== 'all' && row.status !== filters.status) return false;
        if (q && !rowMatchesSearch(row, group, q)) return false;
        return true;
      });

      return {
        ...group,
        accounts,
        accountCount: accounts.length,
        misalignedCount: accounts.filter((a) => a.isMisaligned).length,
      };
    });
}
