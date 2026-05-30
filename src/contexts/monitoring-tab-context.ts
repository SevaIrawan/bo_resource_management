import { createContext } from 'react';
import type { MonitoringTab } from '@/types/monitoring';

export interface MonitoringTabContextValue {
  tab: MonitoringTab;
  setTab: (tab: MonitoringTab) => void;
  ticketCount: number;
}

export const MonitoringTabContext = createContext<MonitoringTabContextValue | null>(null);
