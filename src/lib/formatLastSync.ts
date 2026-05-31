/** Tampilan ringkas untuk kolom Scraper (last update). */
export function formatLastSyncAt(iso: string | null | undefined, locale?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString(locale ?? undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
