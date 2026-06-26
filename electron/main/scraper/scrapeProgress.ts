import { BrowserWindow } from 'electron';
import { touchScrapeWatchdog } from './scrapeWatchdog';

export type ScrapeProgressPhase =
  | 'start'
  | 'connect'
  | 'discover'
  | 'group'
  | 'write'
  | 'done'
  | 'error';

export interface ScrapeProgressPayload {
  sessionId: string;
  phase: ScrapeProgressPhase;
  current?: number;
  total?: number;
  label?: string;
}

export function emitScrapeProgress(payload: ScrapeProgressPayload): void {
  touchScrapeWatchdog(payload.sessionId);
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) return;
  win.webContents.send('scraper:progress', payload);
}
