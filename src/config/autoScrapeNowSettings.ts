/** Toggle Scrape Now — beda dari On Scheduled; default OFF. */
export const AUTO_SCRAPE_NOW_STORAGE_KEY = 'rm_auto_scrape_now_enabled';

/** Event: Settings Execute → jalankan cycle auto scrape sekarang (bukan jadwal). */
export const AUTO_SCRAPE_NOW_RUN_EVENT = 'rm-auto-scrape-now-run';

export function readAutoScrapeNowEnabled(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_SCRAPE_NOW_STORAGE_KEY);
    if (raw === null) return false;
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

export function persistAutoScrapeNowEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_SCRAPE_NOW_STORAGE_KEY, enabled ? '1' : '0');
}

export function requestAutoScrapeNowRun(): void {
  window.dispatchEvent(new Event(AUTO_SCRAPE_NOW_RUN_EVENT));
}
