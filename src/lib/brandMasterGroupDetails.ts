import { MASTER_GROUP_SELECT } from '@/config/masterGroupColumns';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
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

/** Hanya `resource_management_groups_master`. */
export async function fetchBrandMasterGroupDetails(
  brand: string,
  platform: Platform,
): Promise<BrandMasterGroupDetailRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLES.groupsMaster)
    .select(MASTER_GROUP_SELECT)
    .eq('brand', brand.trim())
    .eq('platform', platform)
    .order('group_name', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      group_id: string;
      group_name: string;
      invite_link: string;
      last_sync: string;
      owner_count: number;
      admin_count: number;
      member_count: number;
      member_non_admin: number;
    };
    return {
      groupId: String(r.group_id ?? '').trim(),
      groupName: (r.group_name ?? '').trim() || 'Group',
      inviteLink: (r.invite_link ?? '').trim() || null,
      lastSync: (r.last_sync ?? '').trim() || null,
      ownerCount: Math.max(0, Number(r.owner_count) || 0),
      adminCount: Math.max(0, Number(r.admin_count) || 0),
      memberCount: Math.max(0, Number(r.member_count) || 0),
      memberNonAdmin: Math.max(0, Number(r.member_non_admin) || 0),
    };
  });
}
