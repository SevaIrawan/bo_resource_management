/**
 * Tanggal scrape harian (YYYY-MM-DD) — dipakai Sync/Scrape/login untuk cek daily hari ini.
 * Rantai count/detect Sync lama sudah dihapus; metrik Y/X hanya dari scrape → DB.
 */
export function todayScrapeDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
