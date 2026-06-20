import {
  defaultStockPolicyForBrand,
  isPrefix1GroupName,
  isPrefix2GroupName,
  isPrefix3GroupName,
  type GroupStockNamingPolicy,
} from '@/lib/groupStockPolicy';
import { masterCountMapKey } from '@/lib/loadOperationsMasterCounts';
import type { GroupStockBucket, GroupStockCounts } from '@/types/groupStock';
import { GROUP_STOCK_BUCKETS } from '@/types/groupStock';
import type { Platform } from '@/types/database';

export interface GroupStockClassifyInput {
  groupName: string;
  memberNonAdmin: number;
}

export interface GroupStockMasterRow extends GroupStockClassifyInput {
  brand: string;
  platform: Platform;
  groupId: string;
}

export function emptyGroupStockCounts(): GroupStockCounts {
  return { active: 0, ready: 0, recycle: 0, review: 0, other: 0 };
}

/**
 * Klasifikasi stock per grup master — decision table SOP Operations.
 * Lihat docs/OPERATIONS-STOCK-ENGINE.md
 */
export function classifyGroupStockBucket(
  input: GroupStockClassifyInput,
  policy: GroupStockNamingPolicy = defaultStockPolicyForBrand(''),
): GroupStockBucket {
  const memberNonAdmin = Math.max(0, Math.floor(Number(input.memberNonAdmin) || 0));
  const groupName = input.groupName.trim();
  if (!groupName) return 'other';

  for (const pattern of policy.blocklistPatterns) {
    if (pattern.test(groupName)) return 'other';
  }

  const brand = policy.brand.trim();
  if (!brand) return 'other';

  if (isPrefix3GroupName(groupName, brand) && memberNonAdmin < 1) {
    return 'recycle';
  }
  if (isPrefix2GroupName(groupName, brand) && memberNonAdmin < 1) {
    return 'ready';
  }
  if (isPrefix1GroupName(groupName, brand)) {
    if (memberNonAdmin === 1) return 'active';
    if (memberNonAdmin === 0 || memberNonAdmin > 1) return 'review';
  }

  return 'other';
}

export function aggregateGroupStockCountsForBrand(
  rows: GroupStockClassifyInput[],
  brandName: string,
): GroupStockCounts {
  const policy = defaultStockPolicyForBrand(brandName);
  const counts = emptyGroupStockCounts();
  for (const row of rows) {
    const bucket = classifyGroupStockBucket(row, policy);
    counts[bucket] += 1;
  }
  return counts;
}

export function aggregateGroupStockCountsByBrandPlatform(
  rows: GroupStockMasterRow[],
): Map<string, GroupStockCounts> {
  const byKey = new Map<string, GroupStockClassifyInput[]>();

  for (const row of rows) {
    const brand = row.brand.trim();
    if (!brand || !row.groupId.trim()) continue;
    const key = masterCountMapKey(brand, row.platform);
    const list = byKey.get(key) ?? [];
    list.push({
      groupName: row.groupName,
      memberNonAdmin: row.memberNonAdmin,
    });
    byKey.set(key, list);
  }

  const result = new Map<string, GroupStockCounts>();
  for (const [key, groupRows] of byKey) {
    const brand = key.split(':')[0] ?? '';
    result.set(key, aggregateGroupStockCountsForBrand(groupRows, brand));
  }
  return result;
}

export function readGroupStockCounts(
  counts: Map<string, GroupStockCounts>,
  brandName: string,
  platform: Platform,
): GroupStockCounts {
  return counts.get(masterCountMapKey(brandName, platform)) ?? emptyGroupStockCounts();
}

/** Sanity: semua bucket key terdefinisi. */
export function isCompleteGroupStockCounts(counts: GroupStockCounts): boolean {
  return GROUP_STOCK_BUCKETS.every((bucket) => Number.isFinite(counts[bucket]));
}
