/** Kolom resource_management_groups_master (rekap per brand + platform). */
export const MASTER_GROUP_COLUMNS = [
  'id',
  'group_id',
  'group_name',
  'invite_link',
  'brand',
  'platform',
  'last_sync',
  'owner_count',
  'admin_count',
  'member_count',
  'member_non_admin',
] as const;

export const MASTER_GROUP_SELECT = MASTER_GROUP_COLUMNS.join(', ');
