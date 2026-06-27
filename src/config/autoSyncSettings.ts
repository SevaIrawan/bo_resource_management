export const AUTO_SYNC_STORAGE_KEY = 'rm_auto_sync_enabled';

export function readAutoSyncEnabled(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
    if (raw === null) return false;
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

export function persistAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_SYNC_STORAGE_KEY, enabled ? '1' : '0');
}
