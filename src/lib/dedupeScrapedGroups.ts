export type ScrapedGroupPayload = {
  group_id: string;
  group_name: string;
  invite_link: string | null;
  is_admin: 'yes' | 'no';
  is_owner: 'yes' | 'no';
  member_count: number;
  admin_count: number;
  owner_count: number;
};

function mergeScrapedGroupDupes(
  prev: ScrapedGroupPayload,
  next: ScrapedGroupPayload,
  gid: string,
): ScrapedGroupPayload {
  const prevLink = prev.invite_link?.trim() || null;
  const nextLink = next.invite_link?.trim() || null;
  const isOwner = prev.is_owner === 'yes' || next.is_owner === 'yes' ? 'yes' : 'no';
  const isAdmin =
    isOwner === 'yes' || prev.is_admin === 'yes' || next.is_admin === 'yes' ? 'yes' : 'no';

  const prevAdmin = prev.is_admin === 'yes' || prev.is_owner === 'yes';
  const nextAdmin = next.is_admin === 'yes' || next.is_owner === 'yes';
  let groupName = prev.group_name;
  if (nextAdmin && !prevAdmin && next.group_name.trim()) groupName = next.group_name;
  else if (!groupName.trim() && next.group_name.trim()) groupName = next.group_name;

  return {
    group_id: gid,
    group_name: groupName,
    invite_link: prevLink || nextLink,
    is_admin: isAdmin,
    is_owner: isOwner,
    member_count: Math.max(prev.member_count || 0, next.member_count || 0),
    admin_count: Math.max(prev.admin_count || 0, next.admin_count || 0),
    owner_count: Math.max(prev.owner_count || 0, next.owner_count || 0),
  };
}

/**
 * Satu baris per group_id dalam payload scrape satu akun — merge admin/invite, jangan replace buta.
 *
 * Grup Telegram yang sudah migrate di-upgrade di sidecar ke Super Group ID
 * (`_upgrade_basic_chat_if_migrated`) — bukan tulis basic / skip buta.
 * Tidak boleh ada aturan berbasis `member_count`:
 * nilai 0 juga muncul saat API device gagal, dan membuang baris daily grup yang nyata
 * diikuti akun akan memunculkan tiket missing_group palsu.
 */
export function dedupeScrapedGroupsByGroupId(groups: ScrapedGroupPayload[]): ScrapedGroupPayload[] {
  const map = new Map<string, ScrapedGroupPayload>();
  for (const group of groups) {
    const gid = String(group.group_id ?? '').trim();
    if (!gid) continue;
    const normalized: ScrapedGroupPayload = {
      ...group,
      group_id: gid,
      is_admin: group.is_owner === 'yes' ? 'yes' : group.is_admin === 'yes' ? 'yes' : 'no',
      is_owner: group.is_owner === 'yes' ? 'yes' : 'no',
    };
    const prev = map.get(gid);
    map.set(gid, prev ? mergeScrapedGroupDupes(prev, normalized, gid) : normalized);
  }
  return [...map.values()];
}
