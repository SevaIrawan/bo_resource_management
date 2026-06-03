import { createContext } from 'react';

export interface MonitoringPendingContextValue {
  hasPendingDataUpdate: boolean;
  notifyPendingDataUpdate: () => void;
  clearPendingDataUpdate: () => void;
}

export const MonitoringPendingContext = createContext<MonitoringPendingContextValue | null>(
  null,
);
