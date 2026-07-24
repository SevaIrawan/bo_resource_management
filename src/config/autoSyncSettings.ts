export const AUTO_SYNC_STORAGE_KEY = 'rm_auto_sync_enabled';

/** Same-tab: On Scheduled toggle berubah. */
export const AUTO_SYNC_ENABLED_CHANGED_EVENT = 'rm-auto-sync-enabled-changed';

export function readAutoSyncEnabled(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
    // Belum pernah diset → default On (kontrak Automatic account scrape).
    if (raw === null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

export function persistAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_SYNC_STORAGE_KEY, enabled ? '1' : '0');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTO_SYNC_ENABLED_CHANGED_EVENT, { detail: { enabled } }),
    );
  }
}
