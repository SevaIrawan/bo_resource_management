import { TABLES } from '@/config/tables';

/**
 * Scrape DB: 017_rm_full_reset.sql / upgrade 018_drop_legacy_rm.sql
 * DELETE daily (account) → INSERT daily → RPC rm_rebuild_brand_groups_master
 */
export const SCRAPER_WRITE_TABLE = TABLES.groupScrapeDaily;
