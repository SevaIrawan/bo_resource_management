import type { ScrapedGroupRow } from './index';

/** Gagal scrape hanya jika tidak ada satupun baris grup valid. */
export function assertWhatsAppScrapeHasRows(
  rows: ScrapedGroupRow[],
  deviceGroupCount = 0,
): void {
  if (rows.length > 0) return;
  if (deviceGroupCount > 0) {
    throw new Error(
      `SCRAPER_INCOMPLETE: store listed ${deviceGroupCount} groups but scrape returned 0 rows. Wait for WhatsApp Web sync, then Scrape Now again.`,
    );
  }
  // Kode saja — UI pakai i18n EN/ZH, jangan hardcode bahasa lain.
  throw new Error('SCRAPER_NO_GROUPS');
}
