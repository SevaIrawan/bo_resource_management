/** Toggle Scrape Now — beda dari On Scheduled; default OFF. */
export const AUTO_SCRAPE_NOW_STORAGE_KEY = 'rm_auto_scrape_now_enabled';

/** Same-tab: Scrape Now toggle berubah (storage event tidak fire di tab yang sama). */
export const AUTO_SCRAPE_NOW_CHANGED_EVENT = 'rm-auto-scrape-now-changed';

/** Cycle auto scrape sedang jalan (scheduled atau now) — untuk lock tombol Execute. */
export const AUTO_SCRAPE_CYCLE_RUNNING_EVENT = 'rm-auto-scrape-cycle-running';

export type AutoScrapeCycleMode = 'idle' | 'scheduled' | 'now';

export type AutoScrapeNowRunResult =
  | { ok: true }
  | { ok: false; reason: 'busy' | 'disabled' | 'not_ready' | 'no_targets' };

type AutoScrapeNowRunner = () => Promise<AutoScrapeNowRunResult>;

let scrapeNowRunner: AutoScrapeNowRunner | null = null;
let cycleRunning = false;
let cycleMode: AutoScrapeCycleMode = 'idle';

export function readAutoScrapeNowEnabled(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_SCRAPE_NOW_STORAGE_KEY);
    if (raw === null) return false;
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

export function persistAutoScrapeNowEnabled(
  enabled: boolean,
  opts?: { silent?: boolean },
): void {
  localStorage.setItem(AUTO_SCRAPE_NOW_STORAGE_KEY, enabled ? '1' : '0');
  if (opts?.silent) return;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTO_SCRAPE_NOW_CHANGED_EVENT, { detail: { enabled } }),
    );
  }
}

/** Dipakai `useAutoAccountSync` — satu runner, tanpa duplicate cycle path. */
export function registerAutoScrapeNowRunner(runner: AutoScrapeNowRunner | null): void {
  scrapeNowRunner = runner;
}

export async function requestAutoScrapeNowRun(): Promise<AutoScrapeNowRunResult> {
  if (cycleRunning) return { ok: false, reason: 'busy' };
  if (!scrapeNowRunner) return { ok: false, reason: 'not_ready' };
  return scrapeNowRunner();
}

export function readAutoScrapeCycleRunning(): boolean {
  return cycleRunning;
}

export function readAutoScrapeCycleMode(): AutoScrapeCycleMode {
  return cycleMode;
}

export function setAutoScrapeCycleRunning(
  running: boolean,
  mode: AutoScrapeCycleMode = 'idle',
): void {
  cycleRunning = running;
  cycleMode = running ? mode : 'idle';
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTO_SCRAPE_CYCLE_RUNNING_EVENT, {
        detail: { running: cycleRunning, mode: cycleMode },
      }),
    );
  }
}
