import { createContext } from 'react';
import type { MonitoringTab } from '@/types/monitoring';

export type MonitoringRefreshHandler = (tab: MonitoringTab) => Promise<void>;

export type MonitoringFullRefreshHandler = () => Promise<void>;

export interface MonitoringTabContextValue {
  tab: MonitoringTab;
  setTab: (tab: MonitoringTab) => void;
  ticketCount: number;
  setTicketCount: (count: number) => void;
  refreshActiveTab: () => Promise<void>;
  refreshAllMonitoring: () => Promise<void>;
  registerRefreshHandler: (handler: MonitoringRefreshHandler | null) => void;
  registerFullRefreshHandler: (handler: MonitoringFullRefreshHandler | null) => void;
}

export const MonitoringTabContext = createContext<MonitoringTabContextValue | null>(null);
