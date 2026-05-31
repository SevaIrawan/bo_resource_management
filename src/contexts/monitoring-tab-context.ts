import { createContext } from 'react';
import type { MonitoringTab } from '@/types/monitoring';

export interface MonitoringTabContextValue {
  tab: MonitoringTab;
  setTab: (tab: MonitoringTab) => void;
  ticketCount: number;
  setTicketCount: (count: number) => void;
}

export const MonitoringTabContext = createContext<MonitoringTabContextValue | null>(null);
