import type { ScrapedGroupRow } from './index';

/** Gagal scrape hanya jika tidak ada satupun baris grup valid. */
export function assertWhatsAppScrapeHasRows(rows: ScrapedGroupRow[]): void {
  if (rows.length > 0) return;
  throw new Error(
    'SCRAPER_NO_GROUPS: WhatsApp tidak mengembalikan grup. Pastikan sudah CONNECTED dan coba lagi.',
  );
}
