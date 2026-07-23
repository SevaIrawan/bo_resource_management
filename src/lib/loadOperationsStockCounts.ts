import { TABLES } from '@/config/tables';
import {
  aggregateGroupStockCountsByBrandPlatform,
  type GroupStockMasterRow,
} from '@/lib/classifyGroupStock';
import { replaceOperationsStockMasterCache } from '@/lib/operationsStockMasterCache';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import type { GroupStockCounts } from '@/types/groupStock';
import type { Platform } from '@/types/database';

/** Kolom cukup untuk chip + modal detail (hindari fetch ulang saat klik Ready/…). */
const STOCK_MASTER_SELECT =
  'brand, platform, group_id, group_name, member_non_admin, invite_link, last_sync, owner_count, admin_count, member_count';

/** Klasifikasi stock per brand+platform dari groups_master (read-only). */
export async function loadOperationsStockCountsByBrandPlatform(): Promise<
  Map<string, GroupStockCounts>
> {
  const rows = await fetchAllSupabaseRows<{
    brand: string;
    platform: Platform;
    group_id: string;
    group_name: string;
    member_non_admin: number;
    invite_link: string | null;
    last_sync: string | null;
    owner_count: number;
    admin_count: number;
    member_count: number;
  }>(TABLES.groupsMaster, STOCK_MASTER_SELECT, []);

  const byGroupKey = new Map<string, GroupStockMasterRow>();
  const cacheRows: Array<{
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
  }> = [];

  for (const row of rows) {
    const brand = String(row.brand ?? '').trim();
    const platform = row.platform;
    const groupId = String(row.group_id ?? '').trim();
    const groupName = String(row.group_name ?? '').trim();
    if (!brand || !groupId || (platform !== 'whatsapp' && platform !== 'telegram')) continue;

    const memberNonAdmin = Math.max(0, Number(row.member_non_admin) || 0);
    const inviteLink = String(row.invite_link ?? '').trim() || null;
    const lastSync = String(row.last_sync ?? '').trim() || null;
    const ownerCount = Math.max(0, Number(row.owner_count) || 0);
    const adminCount = Math.max(0, Number(row.admin_count) || 0);
    const memberCount = Math.max(0, Number(row.member_count) || 0);

    byGroupKey.set(`${brand}:${platform}:${groupId}`, {
      brand,
      platform,
      groupId,
      groupName: groupName || 'Group',
      memberNonAdmin,
    });

    cacheRows.push({
      brand,
      platform,
      groupId,
      groupName: groupName || 'Group',
      memberNonAdmin,
      inviteLink,
      lastSync,
      ownerCount,
      adminCount,
      memberCount,
    });
  }

  replaceOperationsStockMasterCache(cacheRows);
  return aggregateGroupStockCountsByBrandPlatform([...byGroupKey.values()]);
}
