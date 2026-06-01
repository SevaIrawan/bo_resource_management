import type { CSSProperties } from 'react';

/** Caption status scraper — teks berjalan (WA/TG) saat kolom sempit. */
export function ScraperStatusMarquee({ label }: { label: string }) {
  const durationSec = Math.max(8, Math.min(22, label.length * 0.32));

  return (
    <span
      className="brand-scraper-marquee"
      role="status"
      aria-busy="true"
      aria-label={label}
      style={{ '--marquee-duration': `${durationSec}s` } as CSSProperties}
    >
      <span className="brand-scraper-marquee__track" aria-hidden="true">
        <span className="brand-scraper-marquee__item">{label}</span>
        <span className="brand-scraper-marquee__item">{label}</span>
      </span>
    </span>
  );
}
