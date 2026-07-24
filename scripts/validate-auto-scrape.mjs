/**
 * Kontrak Auto Scrape (Settings On Scheduled + Scrape Now) — isolasi lane auto vs user.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const hook = read('src/hooks/useAutoAccountSync.ts');
const runAuto = read('src/lib/runAutoAccountScrape.ts');
const runAutoScraper = read('src/lib/runAutoAccountScraper.ts');
const runAccount = read('src/lib/runAccountScraper.ts');
const nowSettings = read('src/config/autoScrapeNowSettings.ts');
const syncSettings = read('src/config/autoSyncSettings.ts');
const brandSettings = read('src/config/autoScrapeBrandSettings.ts');
const policy = read('src/config/autoScrapePolicy.ts');
const schedule = read('src/config/autoScrapeSchedule.ts');
const concurrency = read('src/config/deviceConcurrencyPolicy.ts');
const autoLane = read('electron/main/scraper/autoScrapeLane.ts');
const scraperIndex = read('electron/main/scraper/index.ts');
const settingsUi = read('src/components/settings/AutoSyncSettingsSection.tsx');
const gmp = read('src/providers/GroupMonitoringProvider.tsx');

const checks = [
  {
    name: 'Satu pintu cycle (scheduled + now) tanpa duplicate start/finally',
    ok:
      hook.includes('runAutoScrapeCycle') &&
      hook.includes("runAutoScrapeCycle('scheduled')") &&
      hook.includes("runAutoScrapeCycle('now')") &&
      !hook.includes('persistAutoScrapeLastRunDate(today)') &&
      hook.includes('persistAutoScrapeLastRunDate(formatLocalDateKey'),
  },
  {
    name: 'Scrape Now tidak tulis lastRunDate; scheduled tulis setelah ada target',
    ok:
      hook.includes("if (mode === 'scheduled' && targetCount > 0)") &&
      !/mode === 'now'[\s\S]{0,200}persistAutoScrapeLastRunDate/.test(hook),
  },
  {
    name: 'Abort On Scheduled & Scrape Now setara (teardown)',
    ok:
      hook.includes('abortCycleIfMode') &&
      hook.includes("abortCycleIfMode('scheduled')") &&
      hook.includes("abortCycleIfMode('now')") &&
      hook.includes('AUTO_SCRAPE_NOW_CHANGED_EVENT') &&
      hook.includes('AUTO_SYNC_ENABLED_CHANGED_EVENT') &&
      nowSettings.includes('AUTO_SCRAPE_NOW_CHANGED_EVENT') &&
      syncSettings.includes('AUTO_SYNC_ENABLED_CHANGED_EVENT'),
  },
  {
    name: 'Execute Scrape Now: runner registry + busy/no_targets (bukan silent event)',
    ok:
      nowSettings.includes('registerAutoScrapeNowRunner') &&
      nowSettings.includes('requestAutoScrapeNowRun') &&
      nowSettings.includes("reason: 'busy'") &&
      hook.includes('registerAutoScrapeNowRunner') &&
      settingsUi.includes('await requestAutoScrapeNowRun()') &&
      settingsUi.includes('scrapeNowBusy'),
  },
  {
    name: 'Max 6 brand slots + collectAutoScrapeTargets slice',
    ok:
      concurrency.includes('DEFAULT_MAX_AUTO_SCRAPE_BRAND_SLOTS_PER_PLATFORM = 6') &&
      brandSettings.includes('getMaxAutoScrapeBrandSlotsPerPlatform') &&
      hook.includes('slice(0, input.maxBrandSlots)') &&
      (autoLane.includes('6') || autoLane.includes('MAX')),
  },
  {
    name: 'Acc serial per brand; brand paralel Promise.all',
    ok:
      hook.includes('runBrandPlatformSequential') &&
      hook.includes('Promise.all(brandTasks)') &&
      hook.includes('for (const account of input.accounts)'),
  },
  {
    name: 'Lane auto saja — scraper:run-auto, bukan execute slot user',
    ok: (() => {
      const autoFn = scraperIndex.slice(
        scraperIndex.indexOf('async function executeAutoScrapeRun'),
        scraperIndex.indexOf('export function registerScraperIpc'),
      );
      return (
        runAutoScraper.includes("lane: 'auto'") &&
        runAccount.includes("lane === 'auto'") &&
        scraperIndex.includes("scraper:run-auto") &&
        scraperIndex.includes('tryAcquireAutoScrapeLane') &&
        !autoFn.includes('guardAccountExecute')
      );
    })(),
  },
  {
    name: 'Mid-cycle brand/Acc OFF → watch + cancel-auto',
    ok:
      policy.includes('selectionWatchMs') &&
      policy.includes('isAccountSelected') &&
      runAuto.includes('isAccountSelected') &&
      runAuto.includes('selectionWatchMs') &&
      runAuto.includes('teardownAutoScrapeDevice') &&
      hook.includes('isBrandAccountStillSelected'),
  },
  {
    name: 'GMP wiring useAutoAccountSync + suspend probe via active ids',
    ok:
      gmp.includes('useAutoAccountSync') &&
      gmp.includes('activeAutoScrapeAccountIds'),
  },
  {
    name: 'Settings UI: On Scheduled + Scrape Now draft/Save|Execute/Cancel|Discard',
    ok:
      settingsUi.includes('onScheduledTitle') &&
      settingsUi.includes('scrapeNowTitle') &&
      settingsUi.includes('handleSaveOrExecute') &&
      settingsUi.includes('handleCancelOrDiscard') &&
      settingsUi.includes('persistAutoScrapeNowEnabled'),
  },
  {
    name: 'Schedule gate helper tetap ada (once/day, no catch-up)',
    ok:
      schedule.includes('shouldTriggerAutoScrapeCycle') &&
      schedule.includes('msUntilNextAutoScrapeScheduleCheck'),
  },
  {
    name: 'Execute lock saat cycle running (anti-spam)',
    ok:
      nowSettings.includes('AUTO_SCRAPE_CYCLE_RUNNING_EVENT') &&
      nowSettings.includes('setAutoScrapeCycleRunning') &&
      hook.includes('setAutoScrapeCycleRunning(true') &&
      settingsUi.includes('executeRunning') &&
      settingsUi.includes('cycleRunning') &&
      settingsUi.includes('executeLocked'),
  },
  {
    name: 'Scrape Now one-shot: selesai → factory defaults (Execute disable)',
    ok:
      hook.includes('resetAutoScrapeToFactoryDefaults') &&
      settingsUi.includes('resetAutoScrapeToFactoryDefaults') &&
      settingsUi.includes('AUTO_SCRAPE_FACTORY_RESET_EVENT') &&
      settingsUi.includes('enabledBrandCount === 0') &&
      settingsUi.includes('scrapeNowToggleBlocked'),
  },
  {
    name: 'Factory defaults: Scheduled On, 12:00 PM, 6 brand names',
    ok: (() => {
      const defaults = read('src/config/autoScrapeDefaults.ts');
      const brands = read('src/config/autoScrapeBrandSettings.ts');
      const scheduleFile = read('src/config/autoScrapeSchedule.ts');
      const sync = read('src/config/autoSyncSettings.ts');
      return (
        scheduleFile.includes('DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR = 12') &&
        sync.includes('if (raw === null) return true') &&
        brands.includes("'FWSG'") &&
        brands.includes("'WBSG'") &&
        brands.includes('buildDefaultScheduledBrandToggles') &&
        defaults.includes('resetAutoScrapeToFactoryDefaults') &&
        defaults.includes('hydrateAutoScrapeSettingsForIdleUi') &&
        settingsUi.includes('hydrateAutoScrapeSettingsForIdleUi') &&
        settingsUi.includes('buildScrapeNowEmptyBrandToggles')
      );
    })(),
  },
];

let failed = 0;
for (const check of checks) {
  const mark = check.ok ? 'OK' : 'FAIL';
  console.log(`${mark}  ${check.name}`);
  if (!check.ok) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} auto-scrape contract checks passed.`);
