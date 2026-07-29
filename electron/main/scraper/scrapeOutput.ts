import type { ScrapedGroupRow } from './index';

export function normalizeScrapedGroup(row: Partial<ScrapedGroupRow>): ScrapedGroupRow | null {
  const groupId = String(row.group_id ?? '').trim();
  if (!groupId) return null;

  const isOwner = row.is_owner === 'yes' ? 'yes' : 'no';
  // Owner selalu admin (kompatibilitas metrik/ticket/master gate).
  const isAdmin = isOwner === 'yes' || row.is_admin === 'yes' ? 'yes' : 'no';

  return {
    group_id: groupId,
    group_name: String(row.group_name ?? groupId).trim() || groupId,
    invite_link: row.invite_link ?? null,
    is_admin: isAdmin,
    is_owner: isOwner,
    member_count: Math.max(0, Number(row.member_count) || 0),
    admin_count: Math.max(0, Number(row.admin_count) || 0),
    owner_count: Math.max(0, Number(row.owner_count) || 0),
  };
}

export function normalizeScrapeResult(groups: Partial<ScrapedGroupRow>[]): ScrapedGroupRow[] {
  return groups
    .map(normalizeScrapedGroup)
    .filter((row): row is ScrapedGroupRow => row !== null);
}
