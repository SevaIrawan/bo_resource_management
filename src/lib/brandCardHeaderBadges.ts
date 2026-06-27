import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export type AccountPlatformFilter = 'all' | Platform;

export interface PlatformPairCounts {
  whatsapp: number;
  telegram: number;
}

export function countAccountsByPlatform(
  accounts: ReadonlyArray<{ platform: Platform }>,
): PlatformPairCounts {
  let whatsapp = 0;
  let telegram = 0;
  for (const row of accounts) {
    if (row.platform === 'whatsapp') whatsapp += 1;
    else if (row.platform === 'telegram') telegram += 1;
  }
  return { whatsapp, telegram };
}

export function masterGroupCountsByPlatform(
  byPlatform: AccountBrandGroup['standardGroupCountByPlatform'],
): PlatformPairCounts {
  return {
    whatsapp: byPlatform?.whatsapp ?? 0,
    telegram: byPlatform?.telegram ?? 0,
  };
}
