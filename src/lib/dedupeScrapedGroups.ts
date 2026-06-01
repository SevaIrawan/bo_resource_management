export type ScrapedGroupPayload = {
  group_id: string;
  group_name: string;
  invite_link: string | null;
  is_admin: 'yes' | 'no';
  member_count: number;
  admin_count: number;
  owner_count: number;
};

/** Satu baris per `group_id` — output scraper tidak boleh dobel. */
export function dedupeScrapedGroupsByGroupId(groups: ScrapedGroupPayload[]): ScrapedGroupPayload[] {
  const map = new Map<string, ScrapedGroupPayload>();
  for (const group of groups) {
    const gid = String(group.group_id ?? '').trim();
    if (!gid) continue;
    map.set(gid, { ...group, group_id: gid });
  }
  return [...map.values()];
}
