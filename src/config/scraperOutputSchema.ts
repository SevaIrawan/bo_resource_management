/**
 * Kontrak output scraper WA/TG → Supabase group_scrape_daily (master via trigger DB).
 * Field names harus sama di Python sidecar, Electron scraper, dan accountScraper.ts.
 */
export const SCRAPED_GROUP_FIELDS = [
  'group_id',
  'group_name',
  'invite_link',
  'owner_count',
  'admin_count',
  'member_count',
  'is_admin',
] as const;

export type ScrapedGroupField = (typeof SCRAPED_GROUP_FIELDS)[number];

export type ScrapedIsAdmin = 'yes' | 'no';

export interface ScrapedGroupOutput {
  group_id: string;
  group_name: string;
  invite_link: string | null;
  owner_count: number;
  admin_count: number;
  member_count: number;
  is_admin: ScrapedIsAdmin;
}
