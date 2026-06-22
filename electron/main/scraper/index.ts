import { ipcMain } from 'electron';
import { countTelegramGroups } from './countGroups';
import { countWhatsAppGroups, countWhatsAppGroupsQuick } from './countWhatsApp';
import {
  exportTelegramSession,
  runTelegramScrape,
  restoreTelegramSession,
} from './telegramScrape';
import { validateTelegramSession, validateWhatsAppSession } from './validateSession';
import { normalizeScrapeResult } from './scrapeOutput';
import { runWhatsAppScrape } from './whatsappScrape';
import {
  abortActiveScrape,
  clearActiveScrape,
  isScrapeCancelled,
  registerActiveScrape,
  ScrapeCancelledError,
} from './scrapeCancel';
import { cancelTelegramScrape } from './telegramScrape';
import {
  cancelCountGroups,
  clearCountAbort,
  registerCountAbort,
} from './countGroupsCancel';
import {
  assertAccountExecuteAllowed,
  accountExecuteBusyProbeResult,
} from '../automation/jobQueueGuard';
import { scheduleRunnerTick } from '../automation/jobQueueRunner';

type Platform = 'whatsapp' | 'telegram';

export interface ScrapeRunPayload {
  sessionId: string;
  platform: Platform;
  storedSessionString?: string | null;
  /** Pastikan session = nomor akun grid (WA + TG phone login). */
  expectedPhone?: string;
}

export interface CountGroupsPayload {
  sessionId: string;
  platform: Platform;
  storedSessionString?: string | null;
  /** true = WA harus CONNECTED; TG harus authorized (bukan disk/DB saja). */
  strict?: boolean;
  /** Setelah login QR WA — hitung grup cepat, admin diisi saat scraper penuh. */
  quick?: boolean;
  /** Baru scan QR — pakai client login yang masih hidup, tanpa cold-boot. */
  reuseLiveLogin?: boolean;
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
  let scrapeRunInFlight: Promise<unknown> | null = null;

  ipcMain.handle('scraper:run', async (_event, payload: ScrapeRunPayload) => {
    assertAccountExecuteAllowed(payload.sessionId);
    if (scrapeRunInFlight) {
      throw new Error('SCRAPER_GLOBAL_BUSY: Another scrape is already running on this PC.');
    }

    registerActiveScrape(payload.sessionId);

    const work = (async () => {
    const raw =
      payload.platform === 'telegram'
        ? await runTelegramScrape(
            payload.sessionId,
            payload.storedSessionString,
            payload.expectedPhone,
          )
        : await runWhatsAppScrape(payload.sessionId, payload.expectedPhone);

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
    })();

    scrapeRunInFlight = work;
    try {
      return await work;
    } catch (error) {
      if (error instanceof ScrapeCancelledError || isScrapeCancelled(payload.sessionId)) {
        throw new Error('SCRAPER_CANCELLED');
      }
      throw error;
    } finally {
      clearActiveScrape(payload.sessionId);
      if (scrapeRunInFlight === work) scrapeRunInFlight = null;
      scheduleRunnerTick(0);
    }
  });

  ipcMain.handle(
    'scraper:cancel',
    async (_event, payload: { sessionId: string; platform: Platform }) => {
      await abortActiveScrape(payload.sessionId, payload.platform);
      if (payload.platform === 'telegram') {
        await cancelTelegramScrape(payload.sessionId).catch(() => undefined);
      }
      return { ok: true };
    },
  );

  ipcMain.handle('scraper:count-groups', async (_event, payload: CountGroupsPayload) => {
    assertAccountExecuteAllowed(payload.sessionId);
    registerCountAbort(payload.sessionId);
    try {
      if (payload.platform === 'telegram') {
        return await countTelegramGroups(payload.sessionId, payload.storedSessionString, {
          quick: payload.quick,
        });
      }
      return payload.quick
        ? await countWhatsAppGroupsQuick(payload.sessionId, {
            reuseLiveLogin: payload.reuseLiveLogin,
          })
        : await countWhatsAppGroups(payload.sessionId);
    } finally {
      clearCountAbort(payload.sessionId);
    }
  });

  ipcMain.handle(
    'scraper:cancel-count',
    async (_event, payload: { sessionId: string; platform: Platform }) =>
      cancelCountGroups(payload.sessionId, payload.platform),
  );

  ipcMain.handle('scraper:validate-session', async (_event, payload: CountGroupsPayload) => {
    if (payload.strict) {
      const busy = accountExecuteBusyProbeResult(payload.sessionId);
      if (busy) return busy;
    }
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
