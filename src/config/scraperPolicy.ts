import { TABLES } from '@/config/tables';

/**
 * Scrape DB: RPC rm_commit_account_scrape (035+036) — atomik:
 * DELETE daily akun → INSERT daily → rebuild master brand+platform.
 * Rebuild terpisah (rm_rebuild_brand_groups_master) hanya saat hapus akun dari slot.
 */
export const SCRAPER_WRITE_TABLE = TABLES.groupScrapeDaily;
