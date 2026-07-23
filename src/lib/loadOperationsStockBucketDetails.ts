import {
  fetchBrandMasterGroupDetails,
  type BrandMasterGroupDetailRow,
} from '@/lib/brandMasterGroupDetails';
import { classifyGroupStockBucket } from '@/lib/classifyGroupStock';
import { defaultStockPolicyForBrand } from '@/lib/groupStockPolicy';
import {
  getOperationsStockMasterRows,
  setOperationsStockMasterRowsForBrandPlatform,
} from '@/lib/operationsStockMasterCache';
import type { GroupStockBucket } from '@/types/groupStock';
import type { Platform } from '@/types/database';

export type OperationsStockDetailRow = BrandMasterGroupDetailRow;

/** Grup master brand+platform yang masuk bucket stock (dedupe group_id). */
export async function fetchOperationsStockBucketDetails(
  brandName: string,
  platform: Platform,
  bucket: GroupStockBucket,
): Promise<OperationsStockDetailRow[]> {
  const brand = brandName.trim();
  let rows = getOperationsStockMasterRows(brand, platform);
  if (!rows) {
    rows = await fetchBrandMasterGroupDetails(brand, platform);
    setOperationsStockMasterRowsForBrandPlatform(brand, platform, rows);
  }

  const policy = defaultStockPolicyForBrand(brand);
  const seen = new Set<string>();
  const result: OperationsStockDetailRow[] = [];

  for (const row of rows) {
    const groupId = row.groupId.trim();
    if (!groupId || seen.has(groupId)) continue;
    seen.add(groupId);

    const classified = classifyGroupStockBucket(
      { groupName: row.groupName, memberNonAdmin: row.memberNonAdmin },
      policy,
    );
    if (classified === bucket) result.push(row);
  }

  return result;
}
