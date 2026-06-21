import {
  filterAccountGroups,
  uniqueAccountBrands,
  type AccountSlicerFilters,
} from '@/lib/filterAccountGroups';
import { resolveOperationsPlatform } from '@/lib/operationsPlatformFilter';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export type OperationsBookmark = 'overview' | 'job_queue';

/** Filter tab Operations — independen dari accountFilters tab Account. */
export interface OperationsSlicerFilters {
  brand: string;
  platform: Platform;
  bookmark: OperationsBookmark;
}

export const OPERATIONS_FILTER_DEFAULT: OperationsSlicerFilters = {
  brand: 'all',
  platform: 'whatsapp',
  bookmark: 'overview',
};

export function normalizeOperationsFilters(
  groups: AccountBrandGroup[],
  prev: OperationsSlicerFilters,
): OperationsSlicerFilters {
  const brands = uniqueAccountBrands(groups);
  const brand =
    prev.brand === 'all' || brands.includes(prev.brand) ? prev.brand : 'all';
  const bookmark: OperationsBookmark =
    prev.bookmark === 'job_queue' ? 'job_queue' : 'overview';
  return {
    brand,
    platform: resolveOperationsPlatform(String(prev.platform)),
    bookmark,
  };
}

function toAccountSlicerFilters(filters: OperationsSlicerFilters): AccountSlicerFilters {
  return {
    brand: filters.brand,
    platform: filters.platform,
    status: 'all',
    search: '',
  };
}

/** Brand cards Operations — hanya brand + platform (bukan search/status akun). */
export function filterOperationsBrandGroups(
  groups: AccountBrandGroup[],
  filters: OperationsSlicerFilters,
): AccountBrandGroup[] {
  return filterAccountGroups(groups, toAccountSlicerFilters(filters));
}
