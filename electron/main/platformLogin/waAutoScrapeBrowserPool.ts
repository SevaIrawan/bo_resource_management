/**
 * Slot Chrome terpisah untuk auto scrape harian — tidak mengurangi pool user (max 4).
 */
const AUTO_SCRAPE_MAX_BROWSERS = 1;

let slotsInUse = 0;
const waitQueue: Array<() => void> = [];

function releaseSlot(): void {
  slotsInUse = Math.max(0, slotsInUse - 1);
  const next = waitQueue.shift();
  if (next) next();
}

/** Satu Chrome auto scrape — lane background, tidak antre di waBrowserPool user. */
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
