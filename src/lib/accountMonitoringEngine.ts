/**
 * Satu sumber logika monitoring akun (sync / scraper / hydrate).
 * Groups UI: Y/X (device / standar brand). Admin: admin master / X.
 */
import { buildAccountSyncResult } from '@/lib/accountDisplayMetrics';
import { fetchHasDailyData, fetchMasterGroupStats } from '@/lib/accountSyncData';
import { mergeDeviceGroupIdsIntoDaily } from '@/lib/mergeDeviceGroupIdsIntoDaily';
import { countDeviceGroups, type DeviceGroupCountResult } from '@/lib/runAccountCount';
import { probePlatformSession } from '@/lib/sessionProbe';
import type { AccountSyncResult } from '@/lib/accountBrandUtils';
import type { MasterGroupStats } from '@/lib/accountSyncData';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export function todayScrapeDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Probe session di device (TG/WA) — tidak bergantung row DB untuk WhatsApp. */
export async function probeLivePlatformSession(input: {
  sessionId: string;
  platform: Platform;
  accountId: string;
}): Promise<{ valid: boolean; message?: string }> {
  if (!window.electronAPI?.isElectron) {
    return { valid: false, message: 'SCRAPER_DESKTOP_REQUIRED' };
  }
  return probePlatformSession(input);
}

/** Probe + hitung grup di device (count-only, tanpa QR). */
export async function fetchDeviceGroupCounts(
  input: {
    sessionId: string;
    platform: Platform;
    accountId: string;
  },
  options?: { assumeSessionValid?: boolean; quick?: boolean },
): Promise<DeviceGroupCountResult> {
  if (!options?.assumeSessionValid) {
    const probe = await probeLivePlatformSession(input);
    if (!probe.valid) {
      return {
        valid: false,
        totalGroups: 0,
        adminGroups: 0,
        message: probe.message ?? 'Session invalid',
      };
    }
  }

  return countDeviceGroups(input);
}

/** @deprecated Gunakan buildAccountSyncResult — Y/X + admin/X. */
export function buildSyncResultFromCounts(
  master: MasterGroupStats,
  device: DeviceGroupCountResult,
  brandStandard = 0,
): AccountSyncResult {
  return buildAccountSyncResult({ master, device, brandStandard });
}

export interface RefreshAccountMetricsInput {
  account: AccountBrandRow;
  dbAccountId: string;
  /** X — total grup standar brand (dinamis). */
  brandStandard?: number;
  /** Sudah di-probe di Sync manual — jangan buka WA/TG dua kali. */
  assumeSessionValid?: boolean;
  /** Setelah login QR WA — hitung grup cepat (tanpa loop admin per grup). */
  quickDeviceCount?: boolean;
  /** Lewati merge ribuan group_id ke daily (cukup angka device; detail saat scrape). */
  skipMergeDeviceGroups?: boolean;
}

export interface RefreshAccountMetricsResult {
  result: AccountSyncResult;
  hasDailyToday: boolean;
  device: DeviceGroupCountResult;
  master: MasterGroupStats;
}

/** Satu putaran sync: daily hari ini → master → probe device → counts. */
export async function refreshAccountMetrics(
  input: RefreshAccountMetricsInput,
): Promise<RefreshAccountMetricsResult> {
  const { account, dbAccountId } = input;

  const hasDailyToday = await fetchHasDailyData(
    account.brandName,
    account.accountName,
    account.phoneNumber,
    account.platform,
    todayScrapeDate(),
  );

  const master = await fetchMasterGroupStats(
    account.brandName,
    account.accountName,
    account.phoneNumber,
    account.platform,
    dbAccountId,
  );

  const device = await fetchDeviceGroupCounts(
    {
      sessionId: account.id,
      platform: account.platform,
      accountId: dbAccountId,
    },
    {
      assumeSessionValid: input.assumeSessionValid,
      quick: input.quickDeviceCount,
    },
  );

  const shouldMerge =
    !input.skipMergeDeviceGroups &&
    !input.quickDeviceCount &&
    device.valid &&
    device.groupIds?.length;

  if (shouldMerge) {
    try {
      await mergeDeviceGroupIdsIntoDaily({
        accountId: dbAccountId,
        brand: account.brandName,
        accName: account.accountName,
        phoneNumber: account.phoneNumber,
        platform: account.platform,
        groupIds: device.groupIds ?? [],
      });
    } catch (error) {
      console.warn('[sync] merge device groups into daily failed:', error);
    }
  }

  return {
    hasDailyToday,
    device,
    master,
    result: buildAccountSyncResult({
      master,
      device,
      brandStandard: input.brandStandard ?? 0,
    }),
  };
}
