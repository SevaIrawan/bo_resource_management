import pkg from 'whatsapp-web.js';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import type { ScrapedGroupRow } from './index';
import { isWhatsAppGroupChat } from './whatsappGroupFilter';
import {
  assertWhatsAppScrapeClient,
  listWhatsAppGroupIds,
  waitForWhatsAppInboxStable,
  waitForWhatsAppStoreReady,
} from './whatsappGroupDiscovery';
import { scrapeWhatsAppGroupFromStore } from './whatsappGroupScrapeStore';
import { assertWhatsAppScrapeQuality } from './whatsappScrapeQuality';
import { emitScrapeProgress } from './scrapeProgress';
import {
  DEVICE_GROUP_TARGET_MAX,
  runPooled,
  scrapeGroupsTimeoutMs,
  WA_GROUP_PROCESS_CONCURRENCY,
  withScrapeTimeout,
} from './deviceGroupScale';
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

async function resolveInviteLink(
  chat: { getInviteCode?: () => Promise<string> },
): Promise<string | null> {
  try {
    if (typeof chat.getInviteCode !== 'function') return null;
    const code = await chat.getInviteCode();
    if (!code) return null;
    return `https://chat.whatsapp.com/${code}`;
  } catch {
    return null;
  }
}

async function runWhatsAppScrapeInner(
  sessionId: string,
  expectedPhone?: string,
): Promise<{
  ok: boolean;
  groups: ScrapedGroupRow[];
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

        emitScrapeProgress({ sessionId, phase: 'connect', label: 'Opening fresh WhatsApp session…' });

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

        emitScrapeProgress({ sessionId, phase: 'discover', label: 'Discovering groups on device' });
        const groupIds = await listWhatsAppGroupIds(client);
        const total = groupIds.length;

        emitScrapeProgress({
          sessionId,
          phase: 'discover',
          current: total,
          total,
          label: `${total} groups on device (${loggedInAs})`,
        });

        const rows: ScrapedGroupRow[] = [];
        const scrapeIds = groupIds.slice(0, DEVICE_GROUP_TARGET_MAX);

        if (groupIds.length > DEVICE_GROUP_TARGET_MAX) {
          console.warn(
            `[wa-scrape] ${groupIds.length} groups; scraping first ${DEVICE_GROUP_TARGET_MAX}`,
          );
        }

        emitScrapeProgress({
          sessionId,
          phase: 'group',
          current: 0,
          total: scrapeIds.length,
          label: `Reading groups from server (0/${scrapeIds.length})`,
        });

        let completed = 0;
        let skippedLeft = 0;
        const scraped = await runPooled(scrapeIds, WA_GROUP_PROCESS_CONCURRENCY, async (groupId) => {
          throwIfScrapeCancelled(sessionId);

          const core = await scrapeWhatsAppGroupFromStore(client, groupId);
          if ('skip' in core) {
            if (
              core.reason === 'not_member' ||
              core.reason === 'empty_participants' ||
              core.reason === 'metadata_missing'
            ) {
              skippedLeft += 1;
            }
            return null;
          }

          const chat = await client.getChatById(groupId);
          const inviteLink =
            chat && isWhatsAppGroupChat(chat) ? await resolveInviteLink(chat) : null;

          completed += 1;
          emitScrapeProgress({
            sessionId,
            phase: 'group',
            current: completed,
            total: scrapeIds.length,
            label: `${core.group_name} (${completed}/${scrapeIds.length})`,
          });

          return {
            ...core,
            invite_link: inviteLink,
          } satisfies ScrapedGroupRow;
        });

        for (const row of scraped) {
          if (row) rows.push(row);
        }

        const elapsedMs = Date.now() - startedAt;
        assertWhatsAppScrapeQuality({ rows, elapsedMs, skippedLeft });

        emitScrapeProgress({
          sessionId,
          phase: 'done',
          current: rows.length,
          total: rows.length,
          label: `Scrape finished: ${rows.length} groups (${loggedInAs}, ${Math.round(elapsedMs / 1000)}s)`,
        });

        console.info(
          `[wa-scrape] done sessionId=${sessionId} groups=${rows.length} skipped=${skippedLeft} elapsedMs=${elapsedMs}`,
        );

        return { ok: true, groups: rows, count: rows.length, loggedInAs, elapsedMs };
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
  groups: ScrapedGroupRow[];
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
