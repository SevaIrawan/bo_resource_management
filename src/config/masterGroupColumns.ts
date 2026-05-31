/** Kolom resource_management_groups_master (rekap per brand + platform). */
export const MASTER_GROUP_COLUMNS = [
  'id',
  'group_id',
  'group_name',
  'invite_link',
  'brand',
  'platform',
  'last_sync',
] as const;

export const MASTER_GROUP_SELECT = MASTER_GROUP_COLUMNS.join(', ');
