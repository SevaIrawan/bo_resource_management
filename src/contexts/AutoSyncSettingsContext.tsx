import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR,
  persistAutoScrapeScheduledHour,
  readAutoScrapeScheduledHour,
  clampAutoScrapeScheduledHour,
} from '@/config/autoScrapeSchedule';
import { AUTO_SCRAPE_FACTORY_RESET_EVENT } from '@/config/autoScrapeDefaults';
import { persistAutoSyncEnabled, readAutoSyncEnabled } from '@/config/autoSyncSettings';

export interface AutoSyncSettingsContextValue {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  scheduledHour: number;
  setScheduledHour: (hour: number) => void;
}

const AutoSyncSettingsContext = createContext<AutoSyncSettingsContextValue | null>(null);

export function AutoSyncSettingsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(readAutoSyncEnabled);
  const [scheduledHour, setScheduledHourState] = useState(readAutoScrapeScheduledHour);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    persistAutoSyncEnabled(value);
  }, []);

  const setScheduledHour = useCallback((hour: number) => {
    const clamped = clampAutoScrapeScheduledHour(hour);
    setScheduledHourState(clamped);
    persistAutoScrapeScheduledHour(clamped);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null) return;
      if (event.key.includes('rm_auto_sync') || event.key.includes('rm_auto_scrape')) {
        setEnabledState(readAutoSyncEnabled());
        setScheduledHourState(readAutoScrapeScheduledHour());
      }
    };
    const onFactoryReset = () => {
      setEnabledState(true);
      setScheduledHourState(DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(AUTO_SCRAPE_FACTORY_RESET_EVENT, onFactoryReset);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(AUTO_SCRAPE_FACTORY_RESET_EVENT, onFactoryReset);
    };
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      setEnabled,
      scheduledHour,
      setScheduledHour,
    }),
    [enabled, scheduledHour, setEnabled, setScheduledHour],
  );

  return (
    <AutoSyncSettingsContext.Provider value={value}>
      {children}
    </AutoSyncSettingsContext.Provider>
  );
}

export function useAutoSyncSettings(): AutoSyncSettingsContextValue {
  const ctx = useContext(AutoSyncSettingsContext);
  if (!ctx) {
    return {
      enabled: readAutoSyncEnabled(),
      setEnabled: persistAutoSyncEnabled,
      scheduledHour: readAutoScrapeScheduledHour(),
      setScheduledHour: persistAutoScrapeScheduledHour,
    };
  }
  return ctx;
}

export { DEFAULT_AUTO_SCRAPE_SCHEDULED_HOUR };
