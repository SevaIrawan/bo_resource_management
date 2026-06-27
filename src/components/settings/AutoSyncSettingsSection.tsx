import {
  DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR,
  MAX_AUTO_SCRAPE_SCHEDULED_HOUR,
  MIN_AUTO_SCRAPE_SCHEDULED_HOUR,
} from '@/config/autoScrapeSchedule';
import { useAutoSyncSettings } from '@/contexts/AutoSyncSettingsContext';
import { useLanguage } from '@/hooks/useLanguage';

export function AutoSyncSettingsSection() {
  const { t } = useLanguage();
  const { enabled, setEnabled, scheduledHour, setScheduledHour } = useAutoSyncSettings();

  return (
    <>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border-subtle"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="text-xs text-text-secondary">{t('settings.autoSync.enabled')}</span>
      </label>

      <p className="text-xs leading-relaxed text-text-muted">{t('settings.autoSync.desc')}</p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-text-muted" htmlFor="auto-scrape-scheduled-hour">
          {t('settings.autoSync.scheduledHourLabel')}
        </label>
        <input
          id="auto-scrape-scheduled-hour"
          type="number"
          min={MIN_AUTO_SCRAPE_SCHEDULED_HOUR}
          max={MAX_AUTO_SCRAPE_SCHEDULED_HOUR}
          step={1}
          disabled={!enabled}
          value={scheduledHour}
          onChange={(e) => setScheduledHour(Number(e.target.value))}
          className="w-20 rounded-md border border-border-subtle bg-bg-card px-2 py-1 text-sm text-text-primary disabled:opacity-50"
        />
        <span className="text-xs text-text-muted">{t('settings.autoSync.scheduledHourUnit')}</span>
      </div>

      <p className="text-xs text-text-muted">
        {t('settings.autoSync.defaultScheduledHint', {
          hour: String(DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR).padStart(2, '0'),
        })}
      </p>
      <p className="text-xs text-text-muted">{t('settings.autoSync.scopeHint')}</p>
      <p className="text-xs text-text-muted">{t('settings.autoSync.scheduleRulesHint')}</p>
    </>
  );
}
