import { classifyGroupStockBucket } from '@/lib/classifyGroupStock';
import { defaultStockPolicyForBrand } from '@/lib/groupStockPolicy';
import type { GroupStockBucket } from '@/types/groupStock';

export const REPORTING_STOCK_EXPORT_LABEL: Record<GroupStockBucket, string> = {
  active: 'Active',
  ready: 'Ready',
  recycle: 'Recycle',
  review: 'Review',
  other: 'Other',
};

export function computeReportingStockStatus(
  groupName: string,
  memberNonAdmin: number,
  brandName: string,
): GroupStockBucket {
  return classifyGroupStockBucket(
    { groupName, memberNonAdmin },
    defaultStockPolicyForBrand(brandName),
  );
}
