import {
  buildDefaultScheduledBrandToggles,
  normalizeInactiveAutoScrapeAccountsToAll,
  persistAutoScrapeBrandAccounts,
  persistAutoScrapeBrandToggles,
  readAutoScrapeBrandAccounts,
  readAutoScrapeBrandToggles,
  type AutoScrapeBrandAccountMap,
  type AutoScrapeBrandToggleMap,
} from '@/config/autoScrapeBrandSettings';
import {
  DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR,
  persistAutoScrapeScheduledHour,
  readAutoScrapeScheduledHour,
} from '@/config/autoScrapeSchedule';
import {
  persistAutoScrapeNowEnabled,
  readAutoScrapeCycleMode,
  readAutoScrapeCycleRunning,
  readAutoScrapeNowEnabled,
  setAutoScrapeCycleRunning,
} from '@/config/autoScrapeNowSettings';
import { persistAutoSyncEnabled, readAutoSyncEnabled } from '@/config/autoSyncSettings';

export {
  DEFAULT_AUTO_SCRAPE_SCHEDULED_BRAND_NAMES,
  buildDefaultScheduledBrandToggles,
} from '@/config/autoScrapeBrandSettings';

export const AUTO_SCRAPE_FACTORY_RESET_EVENT = 'rm-auto-scrape-factory-reset';

/** Mode Scrape Now: semua brand Off (user pilih manual). */
export function buildScrapeNowEmptyBrandToggles(): AutoScrapeBrandToggleMap {
  return {};
}

export type AutoScrapeFactoryDefaults = {
  enabled: boolean;
  scheduledHour: number;
  scrapeNow: boolean;
  toggles: AutoScrapeBrandToggleMap;
  accountMap: AutoScrapeBrandAccountMap;
};

/**
 * Default idle (kontrak UI):
 * - On Scheduled = On
 * - Scrape Now = Off
 * - Daily run = 12:00 PM
 * - 6 brand (FWSG…WBSG) On per platform; lainnya Off
 */
export function getAutoScrapeFactoryDefaults(): AutoScrapeFactoryDefaults {
  return {
    enabled: true,
    scheduledHour: DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR,
    scrapeNow: false,
    toggles: buildDefaultScheduledBrandToggles(),
    accountMap: {},
  };
}

/** Persist + broadcast factory defaults. */
export function resetAutoScrapeToFactoryDefaults(): AutoScrapeFactoryDefaults {
  const defaults = getAutoScrapeFactoryDefaults();
  persistAutoSyncEnabled(defaults.enabled);
  persistAutoScrapeScheduledHour(defaults.scheduledHour);
  persistAutoScrapeNowEnabled(defaults.scrapeNow, { silent: true });
  persistAutoScrapeBrandToggles(defaults.toggles);
  persistAutoScrapeBrandAccounts(defaults.accountMap);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTO_SCRAPE_FACTORY_RESET_EVENT, { detail: defaults }),
    );
  }
  return defaults;
}

/**
 * Hydrate Settings saat idle.
 * - Scrape Now On tanpa cycle 'now' aktif = state rusak → paksa Default.
 * - Cycle 'now' aktif → jangan ganggu runner; UI Scrape Now On + brand kosong.
 * - Idle normal → baca storage (hasil Save), Scrape Now selalu Off di UI.
 */
export function hydrateAutoScrapeSettingsForIdleUi(): AutoScrapeFactoryDefaults {
  if (readAutoScrapeCycleRunning() && readAutoScrapeCycleMode() === 'idle') {
    setAutoScrapeCycleRunning(false, 'idle');
  }

  const nowCycleActive =
    readAutoScrapeCycleRunning() && readAutoScrapeCycleMode() === 'now';
  if (nowCycleActive) {
    return {
      enabled: true,
      scheduledHour: readAutoScrapeScheduledHour(),
      scrapeNow: true,
      toggles: buildScrapeNowEmptyBrandToggles(),
      accountMap: {},
    };
  }

  // One-shot nyangkut On / storage kotor → Default penuh.
  if (readAutoScrapeNowEnabled()) {
    return resetAutoScrapeToFactoryDefaults();
  }

  const toggles = readAutoScrapeBrandToggles();
  const accountMap = normalizeInactiveAutoScrapeAccountsToAll(
    toggles,
    readAutoScrapeBrandAccounts(),
  );
  return {
    enabled: readAutoSyncEnabled(),
    scheduledHour: readAutoScrapeScheduledHour(),
    scrapeNow: false,
    toggles,
    accountMap,
  };
}

export function countEnabledAutoScrapeBrands(map: AutoScrapeBrandToggleMap): number {
  let n = 0;
  for (const on of Object.values(map)) {
    if (on) n += 1;
  }
  return n;
}
