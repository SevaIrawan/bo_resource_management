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
  autoSyncIntervalMs,
  clampAutoSyncIntervalMinutes,
  DEFAULT_AUTO_SYNC_INTERVAL_MINUTES,
  persistAutoSyncEnabled,
  persistAutoSyncIntervalMinutes,
  readAutoSyncEnabled,
  readAutoSyncIntervalMinutes,
} from '@/config/autoSyncSettings';

export interface AutoSyncSettingsContextValue {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  intervalMinutes: number;
  setIntervalMinutes: (minutes: number) => void;
  intervalMs: number;
}

const AutoSyncSettingsContext = createContext<AutoSyncSettingsContextValue | null>(null);

export function AutoSyncSettingsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(readAutoSyncEnabled);
  const [intervalMinutes, setIntervalMinutesState] = useState(readAutoSyncIntervalMinutes);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    persistAutoSyncEnabled(value);
  }, []);

  const setIntervalMinutes = useCallback((minutes: number) => {
    const clamped = clampAutoSyncIntervalMinutes(minutes);
    setIntervalMinutesState(clamped);
    persistAutoSyncIntervalMinutes(clamped);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null) return;
      if (event.key.includes('rm_auto_sync')) {
        setEnabledState(readAutoSyncEnabled());
        setIntervalMinutesState(readAutoSyncIntervalMinutes());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      setEnabled,
      intervalMinutes,
      setIntervalMinutes,
      intervalMs: autoSyncIntervalMs(intervalMinutes),
    }),
    [enabled, intervalMinutes, setEnabled, setIntervalMinutes],
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
      intervalMinutes: readAutoSyncIntervalMinutes(),
      setIntervalMinutes: persistAutoSyncIntervalMinutes,
      intervalMs: autoSyncIntervalMs(readAutoSyncIntervalMinutes()),
    };
  }
  return ctx;
}

export { DEFAULT_AUTO_SYNC_INTERVAL_MINUTES };
