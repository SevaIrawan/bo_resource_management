import { TABLES } from '@/config/tables';
import { setOperationsStockMasterRowsForBrandPlatform } from '@/lib/operationsStockMasterCache';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import type { Platform } from '@/types/database';

export interface BrandMasterGroupDetailRow {
  groupId: string;
  groupName: string;
  inviteLink: string | null;
  lastSync: string | null;
  ownerCount: number;
  adminCount: number;
  memberCount: number;
  memberNonAdmin: number;
}

/** Select modal detail — tanpa kolom `id` label yang tidak dipakai UI. */
const DETAIL_SELECT =
  'group_id, group_name, invite_link, last_sync, owner_count, admin_count, member_count, member_non_admin';

/** Hanya `resource_management_groups_master` — paged + ORDER BY stabil. */
export async function fetchBrandMasterGroupDetails(
  brand: string,
  platform: Platform,
): Promise<BrandMasterGroupDetailRow[]> {
  const rows = await fetchAllSupabaseRows<{
    group_id: string;
    group_name: string;
    invite_link: string;
    last_sync: string;
    owner_count: number;
    admin_count: number;
    member_count: number;
    member_non_admin: number;
  }>(TABLES.groupsMaster, DETAIL_SELECT, [
    { column: 'brand', value: brand.trim() },
    { column: 'platform', value: platform },
  ]);

  const mapped = rows
    .map((r) => ({
      groupId: String(r.group_id ?? '').trim(),
      groupName: (r.group_name ?? '').trim() || 'Group',
      inviteLink: (r.invite_link ?? '').trim() || null,
      lastSync: (r.last_sync ?? '').trim() || null,
      ownerCount: Math.max(0, Number(r.owner_count) || 0),
      adminCount: Math.max(0, Number(r.admin_count) || 0),
      memberCount: Math.max(0, Number(r.member_count) || 0),
      memberNonAdmin: Math.max(0, Number(r.member_non_admin) || 0),
    }))
    .sort((a, b) => a.groupName.localeCompare(b.groupName));

  setOperationsStockMasterRowsForBrandPlatform(brand.trim(), platform, mapped);
  return mapped;
}
