import {
  readAutoSyncEnabled,
  persistAutoSyncEnabled,
  AUTO_SYNC_STORAGE_KEY,
} from '@/config/autoSyncSettings';

export { readAutoSyncEnabled, persistAutoSyncEnabled, AUTO_SYNC_STORAGE_KEY };

export const AUTO_SCRAPE_SCHEDULED_HOUR_KEY = 'rm_auto_scrape_scheduled_hour';
export const AUTO_SCRAPE_LAST_RUN_DATE_KEY = 'rm_auto_scrape_last_run_date';

/** Default: 12:00 PM local time, once per day while app is online. */
export const DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR = 12;

export const MIN_AUTO_SCRAPE_SCHEDULED_HOUR = 0;
export const MAX_AUTO_SCRAPE_SCHEDULED_HOUR = 23;

export function clampAutoScrapeScheduledHour(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR;
  return Math.min(
    MAX_AUTO_SCRAPE_SCHEDULED_HOUR,
    Math.max(MIN_AUTO_SCRAPE_SCHEDULED_HOUR, Math.round(value)),
  );
}

/** UI: 0–23 → "12:00 AM" … "11:00 PM" (local). */
export function formatScheduledHourAmPm(hour24: number): string {
  const parts = splitScheduledHourAmPm(hour24);
  return `${parts.hour12}:00 ${parts.period}`;
}

export type ScheduledHourPeriod = 'AM' | 'PM';

export function splitScheduledHourAmPm(hour24: number): {
  hour12: number;
  period: ScheduledHourPeriod;
} {
  const h = clampAutoScrapeScheduledHour(hour24);
  return {
    hour12: h % 12 === 0 ? 12 : h % 12,
    period: h < 12 ? 'AM' : 'PM',
  };
}

/** hour12 = 1–12 + AM/PM → 0–23. */
export function combineScheduledHourAmPm(
  hour12: number,
  period: ScheduledHourPeriod,
): number {
  const raw = Number.isFinite(hour12) ? Math.round(hour12) : 12;
  const h12 = Math.min(12, Math.max(1, raw));
  const hour24 = period === 'AM' ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12;
  return clampAutoScrapeScheduledHour(hour24);
}

export function scheduledHour12Options(): Array<{ value: string; label: string }> {
  return Array.from({ length: 12 }, (_, i) => {
    const hour12 = i + 1;
    return { value: String(hour12), label: `${hour12}:00` };
  });
}

export function scheduledHourPeriodOptions(): Array<{ value: string; label: string }> {
  return [
    { value: 'AM', label: 'AM' },
    { value: 'PM', label: 'PM' },
  ];
}

export function readAutoScrapeScheduledHour(): number {
  try {
    const raw = localStorage.getItem(AUTO_SCRAPE_SCHEDULED_HOUR_KEY);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return clampAutoScrapeScheduledHour(n);
  } catch {
    return DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR;
  }
}

export function persistAutoScrapeScheduledHour(hour: number): void {
  localStorage.setItem(
    AUTO_SCRAPE_SCHEDULED_HOUR_KEY,
    String(clampAutoScrapeScheduledHour(hour)),
  );
}

export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function readAutoScrapeLastRunDate(): string | null {
  try {
    const raw = localStorage.getItem(AUTO_SCRAPE_LAST_RUN_DATE_KEY)?.trim();
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function persistAutoScrapeLastRunDate(dateKey: string): void {
  localStorage.setItem(AUTO_SCRAPE_LAST_RUN_DATE_KEY, dateKey);
}

function scheduledTimeTodayMs(now: Date, scheduledHour: number): number {
  const scheduled = new Date(now);
  scheduled.setHours(clampAutoScrapeScheduledHour(scheduledHour), 0, 0, 0);
  return scheduled.getTime();
}

/**
 * Auto scrape: maksimal sekali per hari kalender, hanya saat app online saat jam scheduled.
 * Tidak catch-up jika app mati dan jam scheduled sudah lewat hari itu.
 */
export function shouldTriggerAutoScrapeCycle(input: {
  now: Date;
  appStartedAt: Date;
  scheduledHour: number;
  lastRunDate: string | null;
}): boolean {
  const today = formatLocalDateKey(input.now);
  if (input.lastRunDate === today) return false;

  const scheduledMs = scheduledTimeTodayMs(input.now, input.scheduledHour);
  const nowMs = input.now.getTime();
  const appStartedMs = input.appStartedAt.getTime();

  if (nowMs < scheduledMs) return false;

  // App dibuka setelah jam scheduled hari ini → window missed, tidak jalan.
  if (appStartedMs > scheduledMs) return false;

  return true;
}

/** Ms until next scheduler tick (poll ringan, max 60s). */
export function msUntilNextAutoScrapeScheduleCheck(now: Date, scheduledHour: number): number {
  const scheduledMs = scheduledTimeTodayMs(now, scheduledHour);
  const nowMs = now.getTime();

  if (nowMs < scheduledMs) {
    return Math.min(60_000, Math.max(1_000, scheduledMs - nowMs));
  }

  return 60_000;
}
