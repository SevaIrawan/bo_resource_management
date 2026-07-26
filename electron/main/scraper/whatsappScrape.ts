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
  formatScrapeEtaLabel,
  runPooled,
  scrapeGroupsBudgetMs,
  scrapeIdleTimeoutMs,
  scrapeInvitePhaseBudgetMs,
  scrapeTotalPlanMs,
  WA_SCRAPE_CHECKPOINT_EVERY,
  WA_SCRAPE_METADATA_CONCURRENCY,
  waInboxStableRounds,
  waInboxStableTimeoutMs,
  waInviteExportDelayMs,
} from './deviceGroupScale';
import { touchScrapeWatchdog, withScrapeWatchdog } from './scrapeWatchdog';
import { abortActiveScrape, throwIfScrapeCancelled, isScrapeCancelled, ScrapeCancelledError } from './scrapeCancel';
import {
  abortActiveAutoScrape,
  throwIfAutoScrapeCancelled,
  isAutoScrapeCancelled,
  AutoScrapeCancelledError,
} from './autoScrapeCancel';
import {
  clearScrapeCheckpoint,
  loadScrapeCheckpoint,
  mergeCheckpointRows,
  saveScrapeCheckpoint,
} from './scrapeCheckpoint';
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
 * `getInviteCode` tidak boleh paralel pada satu Puppeteer client (harus sequential).
 * Checkpoint lokal: resume setelah crash tanpa ulang semua grup.
 */
async function scrapeWhatsAppGroupsFromStore(input: {
  client: InstanceType<typeof Client>;
  sessionId: string;
  throwIfCancelled?: (sessionId: string) => void;
}): Promise<{
  rows: ScrapedGroupRow[];
  skipped: number;
  inviteExported: number;
  deviceGroupCount: number;
  truncated: boolean;
  resumedFromCheckpoint: boolean;
}> {
  const throwIfCancelled = input.throwIfCancelled ?? throwIfScrapeCancelled;
  const groupIds = await listWhatsAppGroupIds(input.client);
  const scanIds = groupIds.slice(0, DEVICE_GROUP_TARGET_MAX);
  const total = scanIds.length;
  let skipped = 0;
  const truncated = groupIds.length > DEVICE_GROUP_TARGET_MAX;

  if (truncated) {
    console.warn(
      `[wa-scrape] ${groupIds.length} groups; scraping first ${DEVICE_GROUP_TARGET_MAX}`,
    );
  }

  const checkpoint = loadScrapeCheckpoint(input.sessionId, 'whatsapp');
  const doneSet = new Set(checkpoint?.doneGroupIds ?? []);
  const pendingIds = scanIds.filter((id) => !doneSet.has(id));
  const resumedFromCheckpoint = Boolean(checkpoint && doneSet.size > 0);
  const liveRows: ScrapedGroupRow[] = [...(checkpoint?.rows ?? [])];
  const liveDone = new Set(doneSet);

  const planMs = scrapeTotalPlanMs(total, Math.max(0, Math.floor(total * 0.35)));
  emitScrapeProgress({
    sessionId: input.sessionId,
    phase: 'discover',
    current: doneSet.size,
    total,
    label: resumedFromCheckpoint
      ? `Resume: ${doneSet.size}/${total} done · ${pendingIds.length} left · ${formatScrapeEtaLabel(planMs)}`
      : `${total} groups on device · ${formatScrapeEtaLabel(planMs)}`,
  });

  const pooled = await runPooled(pendingIds, WA_SCRAPE_METADATA_CONCURRENCY, async (groupId, index) => {
    throwIfCancelled(input.sessionId);

    const core = await scrapeWhatsAppGroupFromStore(input.client, groupId);
    touchScrapeWatchdog(input.sessionId);

    if ('skip' in core) {
      skipped += 1;
      console.warn(`[wa-scrape] skip group ${groupId}: ${core.reason}`);
      return null;
    }

    liveDone.add(groupId);
    liveRows.push({ ...core, invite_link: null });
    const doneCount = liveDone.size;
    if (doneCount % WA_SCRAPE_CHECKPOINT_EVERY === 0 || index === pendingIds.length - 1) {
      saveScrapeCheckpoint({
        sessionId: input.sessionId,
        platform: 'whatsapp',
        updatedAt: new Date().toISOString(),
        rows: mergeCheckpointRows(checkpoint?.rows ?? [], liveRows),
        doneGroupIds: [...liveDone],
      });
    }

    if (doneCount % 10 === 0 || index === pendingIds.length - 1) {
      emitScrapeProgress({
        sessionId: input.sessionId,
        phase: 'group',
        current: Math.min(doneCount, total),
        total,
        label: `Reading groups (${Math.min(doneCount, total)}/${total}) · ${formatScrapeEtaLabel(planMs)}`,
      });
    }

    return { groupId, core };
  });

  const newCoreRows = pooled.filter(
    (row): row is { groupId: string; core: WhatsAppGroupScrapeCore } => row !== null,
  );

  let rows: ScrapedGroupRow[] = mergeCheckpointRows(
    checkpoint?.rows ?? [],
    newCoreRows.map(({ core }) => ({ ...core, invite_link: null })),
  );

  const adminNeedInvite = rows.filter(
    (row) => row.is_admin === 'yes' && !row.invite_link,
  );
  const idleMs = scrapeIdleTimeoutMs(total);
  console.info(
    `[wa-scrape] sessionId=${input.sessionId} deviceGroups=${groupIds.length} scan=${total} pendingMeta=${pendingIds.length} adminInvite=${adminNeedInvite.length} planMs=${scrapeTotalPlanMs(total, adminNeedInvite.length)} metadataMs=${scrapeGroupsBudgetMs(total)} idleMs=${idleMs} resumed=${resumedFromCheckpoint}`,
  );

  saveScrapeCheckpoint({
    sessionId: input.sessionId,
    platform: 'whatsapp',
    updatedAt: new Date().toISOString(),
    rows,
    doneGroupIds: rows.map((r) => String(r.group_id)),
  });

  let inviteExported = 0;
  let adminInviteDone = 0;
  const invitePlanMs = scrapeInvitePhaseBudgetMs(adminNeedInvite.length);

  for (let i = 0; i < adminNeedInvite.length; i += 1) {
    throwIfCancelled(input.sessionId);
    const row = adminNeedInvite[i];
    adminInviteDone += 1;
    emitScrapeProgress({
      sessionId: input.sessionId,
      phase: 'group',
      current: adminInviteDone,
      total: adminNeedInvite.length,
      label: `Export invite: ${row.group_name} (${adminInviteDone}/${adminNeedInvite.length}) · ${formatScrapeEtaLabel(invitePlanMs)}`,
    });
    const invite_link = await fetchWhatsAppGroupInviteLink(input.client, row.group_id);
    touchScrapeWatchdog(input.sessionId);
    if (invite_link) {
      inviteExported += 1;
      row.invite_link = invite_link;
    } else {
      console.warn(
        `[wa-scrape] invite missing for ADMIN group ${row.group_id} (${row.group_name}) — is_admin=yes but getInviteCode/store returned empty`,
      );
    }
    if (adminInviteDone < adminNeedInvite.length) {
      await sleep(waInviteExportDelayMs());
    }

    if (adminInviteDone % WA_SCRAPE_CHECKPOINT_EVERY === 0 || adminInviteDone === adminNeedInvite.length) {
      saveScrapeCheckpoint({
        sessionId: input.sessionId,
        platform: 'whatsapp',
        updatedAt: new Date().toISOString(),
        rows,
        doneGroupIds: rows.map((r) => String(r.group_id)),
      });
    }
  }

  const priorInvites = (checkpoint?.rows ?? []).filter(
    (r) => r.is_admin === 'yes' && r.invite_link,
  ).length;
  inviteExported += priorInvites;

  saveScrapeCheckpoint({
    sessionId: input.sessionId,
    platform: 'whatsapp',
    updatedAt: new Date().toISOString(),
    rows,
    doneGroupIds: rows.map((r) => String(r.group_id)),
  });

  console.info(
    `[wa-scrape] invite_links exported=${inviteExported}/${rows.filter((r) => r.is_admin === 'yes').length} admin groups`,
  );

  return {
    rows,
    skipped,
    inviteExported,
    deviceGroupCount: groupIds.length,
    truncated,
    resumedFromCheckpoint,
  };
}

/**
 * Opsi client yang SAMA untuk manual & auto scrape WA.
 * Auto hanya beda: freshBoot + browserPool 'auto' (isolasi Chrome dari user lane).
 * readyTimeoutMs:0 = tanpa wall-clock putus diam di tengah (kontrak 5000+ grup).
 */
function waScrapeSharedClientOpts(): {
  storeWaitMs: number;
  readyTimeoutMs: 0;
} {
  return {
    storeWaitMs: Math.max(300_000, scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX)),
    readyTimeoutMs: 0,
  };
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
  hint?: string;
  deviceGroupCount?: number;
}> {
  return runWhatsAppScrapeLane({
    sessionId,
    expectedPhone,
    logTag: 'wa-scrape',
    doneLabel: 'Scrape finished',
    cancelError: () => new ScrapeCancelledError(),
    isCancelled: isScrapeCancelled,
    throwIfCancelled: throwIfScrapeCancelled,
    onStale: (sid) => abortActiveScrape(sid, 'whatsapp'),
    watchdogLabel: 'WhatsApp scrape',
    clientOpts: waScrapeSharedClientOpts(),
  });
}

/** Auto scrape lane — pool Chrome terpisah + cancel registry terpisah dari user scrape. */
export async function runWhatsAppScrapeAutoLane(
  sessionId: string,
  expectedPhone?: string,
): Promise<{
  ok: boolean;
  groups: ScrapedGroupRow[];
  count: number;
  loggedInAs?: string;
  elapsedMs?: number;
  hint?: string;
  deviceGroupCount?: number;
}> {
  return runWhatsAppScrapeLane({
    sessionId,
    expectedPhone,
    logTag: 'wa-auto-scrape',
    doneLabel: 'Auto scrape finished',
    undercountDoneLabel: 'Auto scrape',
    cancelError: () => new AutoScrapeCancelledError(),
    isCancelled: isAutoScrapeCancelled,
    throwIfCancelled: throwIfAutoScrapeCancelled,
    onStale: (sid) => abortActiveAutoScrape(sid, 'whatsapp'),
    watchdogLabel: 'WhatsApp auto scrape',
    clientOpts: {
      ...waScrapeSharedClientOpts(),
      freshBoot: true,
      browserPool: 'auto',
    },
  });
}

type WaScrapeLaneOpts = {
  sessionId: string;
  expectedPhone?: string;
  logTag: string;
  doneLabel: string;
  undercountDoneLabel?: string;
  cancelError: () => Error;
  isCancelled: (sessionId: string) => boolean;
  throwIfCancelled: (sessionId: string) => void;
  onStale: (sessionId: string) => void | Promise<void>;
  watchdogLabel: string;
  clientOpts: {
    storeWaitMs: number;
    freshBoot?: boolean;
    browserPool?: 'user' | 'auto';
    /** 0 = tanpa wall-clock ready (scrape akun besar). */
    readyTimeoutMs?: number;
  };
};

async function runWhatsAppScrapeLane(opts: WaScrapeLaneOpts): Promise<{
  ok: boolean;
  groups: ScrapedGroupRow[];
  count: number;
  loggedInAs?: string;
  elapsedMs?: number;
  hint?: string;
  deviceGroupCount?: number;
}> {
  const { sessionId, expectedPhone } = opts;
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
            console.info(`[${opts.logTag}] sessionId=${sessionId} loggedInAs=${loggedInAs}`);

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
            const storeWaitMs = Math.max(
              opts.clientOpts.storeWaitMs ?? 300_000,
              scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX),
            );
            await waitForWhatsAppStoreReady(client, storeWaitMs);
            // freshBoot (auto) sering mulai count=0 — pakai cap store untuk timeout/rounds,
            // sama seperti manual akun besar (kontrak 5000+).
            const inboxGroupEstimate = await countWhatsAppGroupsOnDevice(client);
            const scaleEstimate = Math.max(inboxGroupEstimate, DEVICE_GROUP_TARGET_MAX);
            emitScrapeProgress({
              sessionId,
              phase: 'connect',
              label: `Waiting for inbox sync (${inboxGroupEstimate} groups so far)…`,
            });
            const syncedCount = await waitForWhatsAppInboxStable(client, {
              maxMs: Math.max(
                waInboxStableTimeoutMs(scaleEstimate),
                scrapeIdleTimeoutMs(scaleEstimate),
              ),
              stableRounds: waInboxStableRounds(scaleEstimate),
              pollMs: 5_000,
              sessionId,
              minGroups: 1,
            });
            opts.throwIfCancelled(sessionId);

            if (syncedCount <= 0) {
              throw new Error(
                'SCRAPER_INCOMPLETE: WhatsApp inbox still empty after sync wait. Wait a few minutes, then Scrape Now again.',
              );
            }

            const { rows, skipped, inviteExported, deviceGroupCount, truncated, resumedFromCheckpoint } =
              await scrapeWhatsAppGroupsFromStore({
                client,
                sessionId,
                throwIfCancelled: opts.throwIfCancelled,
              });

            // Sync bilang N, list scrape jauh lebih kecil → store belum lengkap (akun 1900–5000+).
            if (
              !truncated &&
              syncedCount > 50 &&
              deviceGroupCount < Math.floor(syncedCount * 0.85)
            ) {
              throw new Error(
                `SCRAPER_INCOMPLETE: inbox sync peaked at ${syncedCount} but scrape listed ${deviceGroupCount} groups. Wait for WhatsApp Web sync, then Scrape Now again.`,
              );
            }

            assertWhatsAppScrapeHasRows(rows, Math.max(deviceGroupCount, syncedCount));

            const undercount =
              !truncated &&
              deviceGroupCount > 50 &&
              rows.length < Math.floor(deviceGroupCount * 0.85);

            if (undercount) {
              throw new Error(
                `SCRAPER_INCOMPLETE: scraped ${rows.length}/${deviceGroupCount} groups — WhatsApp Web store still incomplete. Wait a few minutes, then Scrape Now again.`,
              );
            }

            clearScrapeCheckpoint(sessionId);

            const elapsedMs = Date.now() - startedAt;
            const adminCount = rows.filter((row) => row.is_admin === 'yes').length;

            const hintParts: string[] = [];
            if (resumedFromCheckpoint) hintParts.push('RESUMED_CHECKPOINT');
            if (truncated) hintParts.push(`TRUNCATED_${DEVICE_GROUP_TARGET_MAX}`);
            if (adminCount > 0 && inviteExported < adminCount) {
              hintParts.push('WA_INVITE_EXPORT_PARTIAL');
            }

            emitScrapeProgress({
              sessionId,
              phase: 'done',
              current: rows.length,
              total: rows.length,
              label: `${opts.doneLabel}: ${rows.length} groups, ${inviteExported}/${adminCount} invite links (${loggedInAs}, ${Math.round(elapsedMs / 1000)}s)`,
            });

            console.info(
              `[${opts.logTag}] done sessionId=${sessionId} groups=${rows.length} device=${deviceGroupCount} skipped=${skipped} inviteExported=${inviteExported}/${adminCount} elapsedMs=${elapsedMs} hints=${hintParts.join(',') || 'none'}`,
            );

            return {
              ok: true,
              groups: rows,
              count: rows.length,
              loggedInAs,
              elapsedMs,
              hint: hintParts.length ? hintParts.join('|') : undefined,
              deviceGroupCount,
            };
          },
          {
            label: opts.watchdogLabel,
            // Skala idle untuk akun besar (hingga cap store) — count device baru ada di dalam fn.
            idleMs: scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX),
            onStale: opts.onStale,
          },
        ),
      opts.clientOpts,
    );
  } catch (error) {
    if (opts.isCancelled(sessionId)) {
      throw opts.cancelError();
    }
    const raw = error instanceof Error ? error.message : 'WhatsApp scrape failed';
    const lower = raw.toLowerCase();
    let message = raw;
    if (
      lower.includes('callfunctionon timed out') ||
      lower.includes('protocolerror') ||
      lower.includes('detached frame') ||
      lower.includes('execution context was destroyed') ||
      lower.includes('target closed') ||
      lower.includes('session closed')
    ) {
      message = 'SCRAPER_WA_CONNECT_FAILED';
    } else if (lower === 'logout' || lower === 'unpaired') {
      message = 'SCRAPER_WA_SESSION_UNLINKED';
    }
    emitScrapeProgress({
      sessionId,
      phase: 'error',
      label: message,
    });
    throw message === raw ? error : new Error(message);
  }
}
