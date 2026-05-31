import { ipcMain } from 'electron';
import { countTelegramGroups } from './countGroups';
import { countWhatsAppGroups } from './countWhatsApp';
import {
  exportTelegramSession,
  runTelegramScrape,
  restoreTelegramSession,
} from './telegramScrape';
import { validateTelegramSession, validateWhatsAppSession } from './validateSession';
import { normalizeScrapeResult } from './scrapeOutput';
import { runWhatsAppScrape } from './whatsappScrape';

type Platform = 'whatsapp' | 'telegram';

export interface ScrapeRunPayload {
  sessionId: string;
  platform: Platform;
  storedSessionString?: string | null;
}

export interface CountGroupsPayload {
  sessionId: string;
  platform: Platform;
  storedSessionString?: string | null;
}

export interface ScrapedGroupRow {
  group_id: string;
  group_name: string;
  invite_link: string | null;
  is_admin: 'yes' | 'no';
  member_count: number;
  admin_count: number;
  owner_count: number;
}

export function registerScraperIpc() {
  ipcMain.handle('scraper:run', async (_event, payload: ScrapeRunPayload) => {
    const raw =
      payload.platform === 'telegram'
        ? await runTelegramScrape(payload.sessionId, payload.storedSessionString)
        : await runWhatsAppScrape(payload.sessionId);

    const groups = normalizeScrapeResult(raw.groups);
    if (!groups.length) {
      throw new Error('SCRAPER_NO_GROUPS');
    }

    return { ...raw, groups, count: groups.length };
  });

  ipcMain.handle('scraper:count-groups', async (_event, payload: CountGroupsPayload) => {
    if (payload.platform === 'telegram') {
      return countTelegramGroups(payload.sessionId, payload.storedSessionString);
    }
    return countWhatsAppGroups(payload.sessionId);
  });

  ipcMain.handle('scraper:validate-session', async (_event, payload: CountGroupsPayload) => {
    try {
      if (payload.platform === 'telegram') {
        return validateTelegramSession(payload.sessionId, payload.storedSessionString);
      }
      return validateWhatsAppSession(payload.sessionId);
    } catch (error) {
      return {
        valid: false,
        message: error instanceof Error ? error.message : 'Session validate failed',
      };
    }
  });

  ipcMain.handle(
    'scraper:export-telegram-session',
    async (_event, sessionId: string) => exportTelegramSession(sessionId),
  );

  ipcMain.handle(
    'scraper:restore-telegram-session',
    async (_event, payload: { sessionId: string; sessionString: string }) =>
      restoreTelegramSession(payload.sessionId, payload.sessionString),
  );
}
