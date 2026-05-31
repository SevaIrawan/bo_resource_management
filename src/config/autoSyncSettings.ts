export const AUTO_SYNC_STORAGE_KEY = 'rm_auto_sync_enabled';
export const AUTO_SYNC_INTERVAL_STORAGE_KEY = 'rm_auto_sync_interval_minutes';

/** Default: sync otomatis setiap 1 jam. */
export const DEFAULT_AUTO_SYNC_INTERVAL_MINUTES = 60;

export const MIN_AUTO_SYNC_INTERVAL_MINUTES = 15;
export const MAX_AUTO_SYNC_INTERVAL_MINUTES = 24 * 60;

export function clampAutoSyncIntervalMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_SYNC_INTERVAL_MINUTES;
  return Math.min(
    MAX_AUTO_SYNC_INTERVAL_MINUTES,
    Math.max(MIN_AUTO_SYNC_INTERVAL_MINUTES, Math.round(value)),
  );
}

export function readAutoSyncEnabled(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
    if (raw === null) return false;
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

export function readAutoSyncIntervalMinutes(): number {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_INTERVAL_STORAGE_KEY);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return clampAutoSyncIntervalMinutes(n);
  } catch {
    return DEFAULT_AUTO_SYNC_INTERVAL_MINUTES;
  }
}

export function persistAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_SYNC_STORAGE_KEY, enabled ? '1' : '0');
}

export function persistAutoSyncIntervalMinutes(minutes: number): void {
  localStorage.setItem(
    AUTO_SYNC_INTERVAL_STORAGE_KEY,
    String(clampAutoSyncIntervalMinutes(minutes)),
  );
}

export function autoSyncIntervalMs(minutes: number): number {
  return clampAutoSyncIntervalMinutes(minutes) * 60_000;
}
