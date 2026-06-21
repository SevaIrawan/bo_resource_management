import { getMaxWaBrowserSlots } from '../platformLogin/waBrowserPool';

/** Job queue runner — selaras pool Chrome WA (default 4, env RM_WA_MAX_CONCURRENT_BROWSERS). */
export function getMaxConcurrentAutomationJobs(): number {
  return getMaxWaBrowserSlots();
}
