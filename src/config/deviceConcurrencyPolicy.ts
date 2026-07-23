/**
 * Kuota execute per platform — WA dan TG terpisah, tidak saling potong.
 * Auto scrape brand / Chrome: DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM (terpisah dari pool user).
 */
export const DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM = 10;

/** Hard cap produk — env tidak boleh melebihi ini. */
export const HARD_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM = 10;

/** Max brand paralel + Chrome auto scrape per platform (WA / TG terpisah). */
export const DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM = 6;

export const HARD_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM = 6;
