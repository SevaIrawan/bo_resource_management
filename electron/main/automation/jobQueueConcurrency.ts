import { getMaxTgExecuteSlots } from '../platformLogin/tgExecuteSlots';
import { getMaxWaBrowserSlots } from '../platformLogin/waBrowserPool';
import type { Platform } from './jobQueueTypes';

/** Job queue — kuota per platform (WA/TG terpisah, default 10 masing-masing). */
export function getMaxConcurrentAutomationJobs(platform: Platform): number {
  return platform === 'telegram' ? getMaxTgExecuteSlots() : getMaxWaBrowserSlots();
}
