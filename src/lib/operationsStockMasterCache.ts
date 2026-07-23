import type { BrandMasterGroupDetailRow } from '@/lib/brandMasterGroupDetails';
import { masterCountMapKey } from '@/lib/loadOperationsMasterCounts';
import type { Platform } from '@/types/database';

/** Snapshot master per brand+platform — isi saat load stock chips; dipakai modal detail. */
const byBrandPlatform = new Map<string, BrandMasterGroupDetailRow[]>();

export function clearOperationsStockMasterCache(): void {
  byBrandPlatform.clear();
}

export function setOperationsStockMasterRowsForBrandPlatform(
  brand: string,
  platform: Platform,
  rows: BrandMasterGroupDetailRow[],
): void {
  const key = masterCountMapKey(brand, platform);
  byBrandPlatform.set(key, rows);
}

/** Isi cache dari baris flat (load stock global). Dedupe group_id per brand+platform. */
export function replaceOperationsStockMasterCache(
  rows: Array<{
    brand: string;
    platform: Platform;
    groupId: string;
    groupName: string;
    memberNonAdmin: number;
    inviteLink: string | null;
    lastSync: string | null;
    ownerCount: number;
    adminCount: number;
    memberCount: number;
  }>,
): void {
  const buckets = new Map<string, Map<string, BrandMasterGroupDetailRow>>();

  for (const row of rows) {
    const brand = row.brand.trim();
    const groupId = row.groupId.trim();
    if (!brand || !groupId) continue;
    if (row.platform !== 'whatsapp' && row.platform !== 'telegram') continue;

    const key = masterCountMapKey(brand, row.platform);
    let byId = buckets.get(key);
    if (!byId) {
      byId = new Map();
      buckets.set(key, byId);
    }
    byId.set(groupId, {
      groupId,
      groupName: row.groupName.trim() || 'Group',
      inviteLink: row.inviteLink,
      lastSync: row.lastSync,
      ownerCount: row.ownerCount,
      adminCount: row.adminCount,
      memberCount: row.memberCount,
      memberNonAdmin: row.memberNonAdmin,
    });
  }

  byBrandPlatform.clear();
  for (const [key, byId] of buckets) {
    byBrandPlatform.set(
      key,
      [...byId.values()].sort((a, b) => a.groupName.localeCompare(b.groupName)),
    );
  }
}

export function getOperationsStockMasterRows(
  brand: string,
  platform: Platform,
): BrandMasterGroupDetailRow[] | undefined {
  return byBrandPlatform.get(masterCountMapKey(brand, platform));
}
