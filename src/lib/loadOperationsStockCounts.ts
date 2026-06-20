import { TABLES } from '@/config/tables';
import {
  aggregateGroupStockCountsByBrandPlatform,
  type GroupStockMasterRow,
} from '@/lib/classifyGroupStock';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import type { GroupStockCounts } from '@/types/groupStock';
import type { Platform } from '@/types/database';

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
  }>(TABLES.groupsMaster, 'brand, platform, group_id, group_name, member_non_admin', []);

  const byGroupKey = new Map<string, GroupStockMasterRow>();

  for (const row of rows) {
    const brand = String(row.brand ?? '').trim();
    const platform = row.platform;
    const groupId = String(row.group_id ?? '').trim();
    const groupName = String(row.group_name ?? '').trim();
    if (!brand || !groupId || (platform !== 'whatsapp' && platform !== 'telegram')) continue;

    byGroupKey.set(`${brand}:${platform}:${groupId}`, {
      brand,
      platform,
      groupId,
      groupName: groupName || 'Group',
      memberNonAdmin: Math.max(0, Number(row.member_non_admin) || 0),
    });
  }

  return aggregateGroupStockCountsByBrandPlatform([...byGroupKey.values()]);
}
