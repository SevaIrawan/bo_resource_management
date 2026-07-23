/**
 * Slot Chrome terpisah untuk auto scrape harian WA.
 * Max 6 — dipegang selama seluruh scrape auto (`withWhatsAppClient` + browserPool auto);
 * tidak mengurangi pool user (10).
 */
import {
  DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
  HARD_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
} from '../../../src/config/deviceConcurrencyPolicy';

const AUTO_SCRAPE_MAX_BROWSERS = Math.min(
  DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
  HARD_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM,
);

let slotsInUse = 0;
const waitQueue: Array<() => void> = [];

function releaseSlot(): void {
  slotsInUse = Math.max(0, slotsInUse - 1);
  const next = waitQueue.shift();
  if (next) next();
}

/** Chrome auto scrape — lane background, tidak antre di waBrowserPool user. */
export async function withWaAutoScrapeBrowserSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (slotsInUse >= AUTO_SCRAPE_MAX_BROWSERS) {
    await new Promise<void>((resolve) => {
      waitQueue.push(resolve);
    });
  }
  slotsInUse += 1;
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

export function getMaxWaAutoScrapeBrowsers(): number {
  return AUTO_SCRAPE_MAX_BROWSERS;
}

export function getWaAutoScrapeBrowserPoolStats(): {
  inUse: number;
  waiting: number;
  max: number;
} {
  return {
    inUse: slotsInUse,
    waiting: waitQueue.length,
    max: AUTO_SCRAPE_MAX_BROWSERS,
  };
}
