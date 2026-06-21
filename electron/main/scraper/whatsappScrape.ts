import pkg from 'whatsapp-web.js';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import {
  assertWhatsAppScrapeClient,
  waitForWhatsAppInboxStable,
  waitForWhatsAppStoreReady,
} from './whatsappGroupDiscovery';
import { scrapeAllWhatsAppGroups } from './whatsappScrapeGroups';
import { assertWhatsAppScrapeHasRows } from './whatsappScrapeQuality';
import { emitScrapeProgress } from './scrapeProgress';
import { DEVICE_GROUP_TARGET_MAX, scrapeGroupsTimeoutMs, withScrapeTimeout } from './deviceGroupScale';
import { throwIfScrapeCancelled } from './scrapeCancel';

const { Client } = pkg;

function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

function phonesMatch(a: string, b: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}

async function assertWhatsAppLoggedInPhone(
  client: InstanceType<typeof Client>,
  expectedPhone?: string,
): Promise<string> {
  const loggedInAs =
    client.info?.wid?.user ??
    (client.info as { me?: { user?: string } } | undefined)?.me?.user ??
    'unknown';

  if (expectedPhone?.trim()) {
    const exp = normalizePhoneDigits(expectedPhone);
    const got = normalizePhoneDigits(loggedInAs);
    if (exp && got && !phonesMatch(exp, got)) {
      throw new Error(
        `WA_ACCOUNT_MISMATCH: WhatsApp logged in as ${loggedInAs}, expected ${expectedPhone.trim()}. Clear session and log in again.`,
      );
    }
  }

  return loggedInAs;
}

async function runWhatsAppScrapeInner(
  sessionId: string,
  expectedPhone?: string,
): Promise<{
  ok: boolean;
  groups: import('./index').ScrapedGroupRow[];
  count: number;
  loggedInAs?: string;
  elapsedMs?: number;
}> {
  emitScrapeProgress({ sessionId, phase: 'start' });
  const startedAt = Date.now();

  try {
    return await withWhatsAppClient(
      sessionId,
      async (client) => {
        assertWhatsAppScrapeClient(client);

        emitScrapeProgress({ sessionId, phase: 'connect', label: 'Opening WhatsApp session…' });

        const loggedInAs = await assertWhatsAppLoggedInPhone(client, expectedPhone);
        console.info(`[wa-scrape] sessionId=${sessionId} loggedInAs=${loggedInAs}`);

        const state = await client.getState();
        if (state !== 'CONNECTED') {
          throw new Error(
            `WA_NOT_CONNECTED: WhatsApp is not connected (${state ?? 'unknown'}). Log in again.`,
          );
        }

        emitScrapeProgress({
          sessionId,
          phase: 'connect',
          label: 'Syncing WhatsApp inbox from server…',
        });
        await waitForWhatsAppStoreReady(client, 120_000);
        await waitForWhatsAppInboxStable(client);
        throwIfScrapeCancelled(sessionId);

        emitScrapeProgress({
          sessionId,
          phase: 'discover',
          label: 'Loading group list (getChats)…',
        });

        const { rows, skipped } = await scrapeAllWhatsAppGroups({
          client,
          sessionId,
          onProgress: ({ current, total, label }) => {
            emitScrapeProgress({
              sessionId,
              phase: 'group',
              current,
              total,
              label,
            });
          },
        });

        assertWhatsAppScrapeHasRows(rows);

        const elapsedMs = Date.now() - startedAt;

        emitScrapeProgress({
          sessionId,
          phase: 'done',
          current: rows.length,
          total: rows.length,
          label: `Scrape finished: ${rows.length} groups (${loggedInAs}, ${Math.round(elapsedMs / 1000)}s)`,
        });

        console.info(
          `[wa-scrape] done sessionId=${sessionId} groups=${rows.length} skipped=${skipped} elapsedMs=${elapsedMs}`,
        );

        return {
          ok: true,
          groups: rows,
          count: rows.length,
          loggedInAs,
          elapsedMs,
        };
      },
      { freshBoot: true, storeWaitMs: 120_000 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp scrape failed';
    emitScrapeProgress({ sessionId, phase: 'error', label: message });
    throw error;
  }
}

export async function runWhatsAppScrape(
  sessionId: string,
  expectedPhone?: string,
): Promise<{
  ok: boolean;
  groups: import('./index').ScrapedGroupRow[];
  count: number;
  loggedInAs?: string;
  elapsedMs?: number;
}> {
  return withScrapeTimeout(
    runWhatsAppScrapeInner(sessionId, expectedPhone),
    scrapeGroupsTimeoutMs(DEVICE_GROUP_TARGET_MAX),
    'WhatsApp scrape',
  );
}
