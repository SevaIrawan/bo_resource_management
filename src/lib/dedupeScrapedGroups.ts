export type ScrapedGroupPayload = {
  group_id: string;
  group_name: string;
  invite_link: string | null;
  is_admin: 'yes' | 'no';
  member_count: number;
  admin_count: number;
  owner_count: number;
};

/** Satu baris per `group_id` — prefer baris dengan invite_link jika duplikat. */
export function dedupeScrapedGroupsByGroupId(groups: ScrapedGroupPayload[]): ScrapedGroupPayload[] {
  const map = new Map<string, ScrapedGroupPayload>();
  for (const group of groups) {
    const gid = String(group.group_id ?? '').trim();
    if (!gid) continue;
    const prev = map.get(gid);
    if (!prev) {
      map.set(gid, { ...group, group_id: gid });
      continue;
    }
    const prevLink = prev.invite_link?.trim();
    const nextLink = group.invite_link?.trim();
    if (!prevLink && nextLink) {
      map.set(gid, { ...group, group_id: gid });
    }
  }
  return [...map.values()];
}
