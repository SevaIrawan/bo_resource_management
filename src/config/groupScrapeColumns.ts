/**
 * Kolom resource_management_group_scrape_daily (PK: id + scrape_date).
 * Master brand: lihat masterGroupColumns.ts
 */
export const GROUP_SCRAPE_COLUMNS = [
  'id',
  'account_id',
  'group_name',
  'group_id',
  'invite_link',
  'owner_count',
  'admin_count',
  'member_count',
  'is_admin',
  'is_owner',
  'platform',
  'scrape_date',
  'scraped_at',
  'created_at',
  'brand',
  'acc_name',
  'phone_number',
] as const;

export type GroupScrapeColumn = (typeof GROUP_SCRAPE_COLUMNS)[number];

/** Select lengkap untuk probe / validasi schema Supabase. */
export const GROUP_SCRAPE_SELECT = GROUP_SCRAPE_COLUMNS.join(', ');
