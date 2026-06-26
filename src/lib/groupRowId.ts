/** PK daily: `{group_id}-{acc_name}` — unik per akun. */
export function buildGroupRowId(groupId: string, accName: string): string {
  return `${String(groupId).trim()}-${String(accName).trim()}`;
}

/** Label master (selaras DB): `{brand}\x1e{platform}\x1e{group_id}`. PK = brand+platform+group_id. */
export function buildMasterRowId(brand: string, platform: string, groupId: string): string {
  return `${String(brand).trim()}\x1e${String(platform).trim()}\x1e${String(groupId).trim()}`;
}
