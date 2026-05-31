import {
  DEFAULT_AUTO_SYNC_INTERVAL_MINUTES,
  MAX_AUTO_SYNC_INTERVAL_MINUTES,
  MIN_AUTO_SYNC_INTERVAL_MINUTES,
} from '@/config/autoSyncSettings';
import { useAutoSyncSettings } from '@/contexts/AutoSyncSettingsContext';
import { useLanguage } from '@/hooks/useLanguage';

export function AutoSyncSettingsSection() {
  const { t } = useLanguage();
  const { enabled, setEnabled, intervalMinutes, setIntervalMinutes } = useAutoSyncSettings();

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
        <label className="text-xs text-text-muted" htmlFor="auto-sync-interval">
          {t('settings.autoSync.intervalLabel')}
        </label>
        <input
          id="auto-sync-interval"
          type="number"
          min={MIN_AUTO_SYNC_INTERVAL_MINUTES}
          max={MAX_AUTO_SYNC_INTERVAL_MINUTES}
          step={15}
          disabled={!enabled}
          value={intervalMinutes}
          onChange={(e) => setIntervalMinutes(Number(e.target.value))}
          className="w-24 rounded-md border border-border-subtle bg-bg-card px-2 py-1 text-sm text-text-primary disabled:opacity-50"
        />
        <span className="text-xs text-text-muted">{t('settings.autoSync.intervalUnit')}</span>
      </div>

      <p className="text-xs text-text-muted">
        {t('settings.autoSync.defaultHint', {
          minutes: DEFAULT_AUTO_SYNC_INTERVAL_MINUTES,
        })}
      </p>
      <p className="text-xs text-text-muted">{t('settings.autoSync.scopeHint')}</p>
    </>
  );
}
