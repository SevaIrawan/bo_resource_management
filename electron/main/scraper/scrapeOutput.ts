import type { ScrapedGroupRow } from './index';

/** ISO valid → ISO; selain itu null (kolom group_created_at TIMESTAMPTZ, migrasi 043). */
function normalizeGroupCreatedAt(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

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
    group_created_at: normalizeGroupCreatedAt(row.group_created_at),
  };
}

export function normalizeScrapeResult(groups: Partial<ScrapedGroupRow>[]): ScrapedGroupRow[] {
  return groups
    .map(normalizeScrapedGroup)
    .filter((row): row is ScrapedGroupRow => row !== null);
}
