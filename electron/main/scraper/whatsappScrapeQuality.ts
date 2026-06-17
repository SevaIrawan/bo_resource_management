import type { ScrapedGroupRow } from './index';
import { WA_GROUP_PROCESS_CONCURRENCY } from './deviceGroupScale';

/** Runtime gate — bukan validator string; gagal scrape jika hasil terlalu mirip cache palsu. */
export function assertWhatsAppScrapeQuality(input: {
  rows: ScrapedGroupRow[];
  elapsedMs: number;
  skippedLeft: number;
}): void {
  const { rows, elapsedMs, skippedLeft } = input;
  const n = rows.length;
  if (n < 5) return;

  const minElapsedMs = Math.max(
    45_000,
    Math.round((n * 1_200) / WA_GROUP_PROCESS_CONCURRENCY),
  );
  if (elapsedMs < minElapsedMs) {
    throw new Error(
      `SCRAPE_TOO_FAST: ${n} groups in ${Math.round(elapsedMs / 1000)}s (min ~${Math.round(minElapsedMs / 1000)}s for server metadata). Clear session & scrape again.`,
    );
  }

  const badMember = rows.filter((r) => r.member_count <= 1).length;
  const badRatio = badMember / n;
  if (badRatio > 0.08) {
    throw new Error(
      `SCRAPE_INCOMPLETE: ${badMember}/${n} groups have member_count≤1 — participant data not loaded. Re-login WhatsApp and retry.`,
    );
  }

  if (skippedLeft > 0) {
    console.info(`[wa-scrape-quality] skipped ${skippedLeft} groups (left / empty metadata)`);
  }
}
