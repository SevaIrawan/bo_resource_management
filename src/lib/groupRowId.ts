/** PK daily: `{group_id}-{acc_name}` — unik per akun. */
export function buildGroupRowId(groupId: string, accName: string): string {
  return `${String(groupId).trim()}-${String(accName).trim()}`;
}

/** PK master brand: `{group_id} - {group_name}` */
export function buildMasterRowId(groupId: string, groupName: string): string {
  return `${String(groupId).trim()} - ${String(groupName).trim()}`;
}
