/**
 * @deprecated Import from `@/config/syncScraperPolicy` — re-export compat validator/Electron mirror.
 */
import {
  manualSyncTimeoutMs,
  postLoginSyncTimeoutMs,
  SYNC_SCRAPER_POLICY,
} from '@/config/syncScraperPolicy';

export { manualSyncTimeoutMs, SYNC_SCRAPER_POLICY };

export const DEVICE_GROUP_TARGET_MAX = SYNC_SCRAPER_POLICY.deviceGroupTargetMax;

/** Alias legacy — sama dengan postLoginSyncTimeoutMs. */
export function loginSyncAfterTimeoutMs(
  estimate: number = DEVICE_GROUP_TARGET_MAX,
): number {
  return postLoginSyncTimeoutMs(estimate);
}
