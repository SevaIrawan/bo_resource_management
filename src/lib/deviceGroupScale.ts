/** Sinkron dengan `electron/main/scraper/deviceGroupScale.ts`. */
export const DEVICE_GROUP_TARGET_MAX = 2000;

const LOGIN_SYNC_BASE_MS = 120_000;
const LOGIN_SYNC_PER_GROUP_MS = 25;
const LOGIN_SYNC_MAX_MS = 600_000;

const MANUAL_SYNC_BASE_MS = 120_000;
const MANUAL_SYNC_PER_GROUP_MS = 35;
const MANUAL_SYNC_MAX_MS = 900_000;

export function loginSyncAfterTimeoutMs(
  estimate = DEVICE_GROUP_TARGET_MAX,
): number {
  return Math.min(
    LOGIN_SYNC_MAX_MS,
    LOGIN_SYNC_BASE_MS + estimate * LOGIN_SYNC_PER_GROUP_MS,
  );
}

export function manualSyncTimeoutMs(estimate = DEVICE_GROUP_TARGET_MAX): number {
  return Math.min(
    MANUAL_SYNC_MAX_MS,
    MANUAL_SYNC_BASE_MS + estimate * MANUAL_SYNC_PER_GROUP_MS,
  );
}
