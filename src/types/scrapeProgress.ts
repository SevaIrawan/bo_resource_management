/** Progress scrape dari Electron (`scraper:progress`) — angka nyata, bukan animasi UI. */
export interface UiScrapeProgress {
  phase: string;
  current: number;
  total: number;
  label: string;
  /** Hanya ada bila `total > 0` dan `current` diketahui. */
  percent: number | null;
}
