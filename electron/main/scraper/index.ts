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
  /** true = WA harus CONNECTED; TG harus authorized (bukan disk/DB saja). */
  strict?: boolean;
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
      const hint =
        typeof (raw as { hint?: string }).hint === 'string'
          ? (raw as { hint: string }).hint
          : undefined;
      const tgUser =
        typeof (raw as { telegramUser?: string }).telegramUser === 'string'
          ? (raw as { telegramUser: string }).telegramUser
          : undefined;
      if (payload.platform === 'telegram' && hint === 'ZERO_GROUPS_ON_ACCOUNT') {
        throw new Error(
          `SCRAPER_NO_GROUPS: Telegram @${tgUser ?? 'unknown'} — tidak ada grup di akun ini. Login ulang jika salah akun.`,
        );
      }
      if (payload.platform === 'whatsapp') {
        throw new Error(
          'SCRAPER_NO_GROUPS: WhatsApp tidak mengembalikan grup. Pastikan sudah CONNECTED dan coba lagi.',
        );
      }
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
      return validateWhatsAppSession(payload.sessionId, { strict: payload.strict });
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
