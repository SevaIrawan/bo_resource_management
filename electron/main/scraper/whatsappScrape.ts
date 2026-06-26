import pkg from 'whatsapp-web.js';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import {
  assertWhatsAppScrapeClient,
  countWhatsAppGroupsOnDevice,
  listWhatsAppGroupIds,
  waitForWhatsAppInboxStable,
  waitForWhatsAppStoreReady,
} from './whatsappGroupDiscovery';
import { scrapeWhatsAppGroupFromStore } from './whatsappGroupScrapeStore';
import { fetchWhatsAppGroupInviteLink } from './whatsappGroupInviteLink';
import { assertWhatsAppScrapeHasRows } from './whatsappScrapeQuality';
import { emitScrapeProgress } from './scrapeProgress';
import {
  DEVICE_GROUP_TARGET_MAX,
  runPooled,
  scrapeGroupsBudgetMs,
  scrapeTotalPlanMs,
  SCRAPE_IDLE_TIMEOUT_MS,
  waInboxStableTimeoutMs,
  WA_SCRAPE_METADATA_CONCURRENCY,
  waInviteExportDelayMs,
} from './deviceGroupScale';
import { touchScrapeWatchdog, withScrapeWatchdog } from './scrapeWatchdog';
import { abortActiveScrape, throwIfScrapeCancelled, isScrapeCancelled, ScrapeCancelledError } from './scrapeCancel';
import type { ScrapedGroupRow } from './index';
import type { WhatsAppGroupScrapeCore } from './whatsappGroupScrapeStore';

const { Client } = pkg;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/**
 * Scrape penuh WA — fase 1: metadata paralel (store); fase 2: invite link serial per grup admin.
 * `getInviteCode` tidak boleh paralel pada satu Puppeteer client (learning scraper sequential).
 */
async function scrapeWhatsAppGroupsFromStore(input: {
  client: InstanceType<typeof Client>;
  sessionId: string;
}): Promise<{ rows: ScrapedGroupRow[]; skipped: number; inviteExported: number }> {
  const groupIds = await listWhatsAppGroupIds(input.client);
  const scanIds = groupIds.slice(0, DEVICE_GROUP_TARGET_MAX);
  const total = scanIds.length;
  let skipped = 0;

  if (groupIds.length > DEVICE_GROUP_TARGET_MAX) {
    console.warn(
      `[wa-scrape] ${groupIds.length} groups; scraping first ${DEVICE_GROUP_TARGET_MAX}`,
    );
  }

  emitScrapeProgress({
    sessionId: input.sessionId,
    phase: 'discover',
    current: total,
    total,
    label: `${total} groups on device`,
  });

  const pooled = await runPooled(scanIds, WA_SCRAPE_METADATA_CONCURRENCY, async (groupId, index) => {
    throwIfScrapeCancelled(input.sessionId);

    const core = await scrapeWhatsAppGroupFromStore(input.client, groupId);
    touchScrapeWatchdog(input.sessionId);

    if ('skip' in core) {
      skipped += 1;
      console.warn(`[wa-scrape] skip group ${groupId}: ${core.reason}`);
      return null;
    }

    if ((index + 1) % 25 === 0 || index === scanIds.length - 1) {
      emitScrapeProgress({
        sessionId: input.sessionId,
        phase: 'group',
        current: index + 1,
        total,
        label: `Reading groups (${index + 1}/${total})`,
      });
    }

    return { groupId, core };
  });

  const coreRows = pooled.filter(
    (row): row is { groupId: string; core: WhatsAppGroupScrapeCore } => row !== null,
  );

  const adminRows = coreRows.filter((row) => row.core.is_admin === 'yes');
  console.info(
    `[wa-scrape] sessionId=${input.sessionId} deviceGroups=${groupIds.length} scan=${total} admin=${adminRows.length} planMs=${scrapeTotalPlanMs(total, adminRows.length)} metadataMs=${scrapeGroupsBudgetMs(total)} idleMs=${SCRAPE_IDLE_TIMEOUT_MS}`,
  );

  let inviteExported = 0;
  let adminInviteDone = 0;
  const rows: ScrapedGroupRow[] = [];

  for (let i = 0; i < coreRows.length; i += 1) {
    throwIfScrapeCancelled(input.sessionId);
    const { groupId, core } = coreRows[i];
    let invite_link: string | null = null;

    if (core.is_admin === 'yes') {
      adminInviteDone += 1;
      emitScrapeProgress({
        sessionId: input.sessionId,
        phase: 'group',
        current: i + 1,
        total: coreRows.length,
        label: `Export invite link: ${core.group_name} (${adminInviteDone}/${adminRows.length})`,
      });
      invite_link = await fetchWhatsAppGroupInviteLink(input.client, groupId);
      touchScrapeWatchdog(input.sessionId);
      if (invite_link) inviteExported += 1;
      if (adminInviteDone < adminRows.length) {
        await sleep(waInviteExportDelayMs());
      }
    }

    rows.push({ ...core, invite_link });
  }

  console.info(
    `[wa-scrape] invite_links exported=${inviteExported}/${adminRows.length} admin groups`,
  );

  return { rows, skipped, inviteExported };
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
  emitScrapeProgress({ sessionId, phase: 'start' });
  const startedAt = Date.now();

  try {
    return await withWhatsAppClient(
      sessionId,
      async (client) =>
        withScrapeWatchdog(
          sessionId,
          async () => {
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
            const deviceGroupCount = await countWhatsAppGroupsOnDevice(client);
            await waitForWhatsAppInboxStable(client, {
              maxMs: waInboxStableTimeoutMs(deviceGroupCount),
            });
            throwIfScrapeCancelled(sessionId);

            const { rows, skipped, inviteExported } = await scrapeWhatsAppGroupsFromStore({
              client,
              sessionId,
            });

            assertWhatsAppScrapeHasRows(rows);

            const elapsedMs = Date.now() - startedAt;
            const adminCount = rows.filter((row) => row.is_admin === 'yes').length;

            emitScrapeProgress({
              sessionId,
              phase: 'done',
              current: rows.length,
              total: rows.length,
              label: `Scrape finished: ${rows.length} groups, ${inviteExported}/${adminCount} invite links (${loggedInAs}, ${Math.round(elapsedMs / 1000)}s)`,
            });

            console.info(
              `[wa-scrape] done sessionId=${sessionId} groups=${rows.length} skipped=${skipped} inviteExported=${inviteExported}/${adminCount} elapsedMs=${elapsedMs}`,
            );

            return {
              ok: true,
              groups: rows,
              count: rows.length,
              loggedInAs,
              elapsedMs,
            };
          },
          {
            label: 'WhatsApp scrape',
            idleMs: SCRAPE_IDLE_TIMEOUT_MS,
            onStale: (sid) => abortActiveScrape(sid, 'whatsapp'),
          },
        ),
      { storeWaitMs: 120_000 },
    );
  } catch (error) {
    if (isScrapeCancelled(sessionId)) {
      throw new ScrapeCancelledError();
    }
    const message = error instanceof Error ? error.message : 'WhatsApp scrape failed';
    emitScrapeProgress({ sessionId, phase: 'error', label: message });
    throw error;
  }
}
