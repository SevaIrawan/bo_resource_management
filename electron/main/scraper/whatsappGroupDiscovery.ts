import type { Client } from 'whatsapp-web.js';
import { DEVICE_GROUP_TARGET_MAX, WA_STORE_GROUP_LIST_CAP } from './deviceGroupScale';
import { touchScrapeWatchdog } from './scrapeWatchdog';
import { emitScrapeProgress } from './scrapeProgress';

const WA_STORE_WAIT_MS = 120_000;
const WA_STORE_POLL_MS = 250;

async function isWWebJsReady(client: Client): Promise<boolean> {
  if (!client.pupPage) return false;
  try {
    return await client.pupPage.evaluate(
      () =>
        typeof window.WWebJS !== 'undefined' &&
        typeof window.WWebJS.getChat === 'function' &&
        typeof window.require === 'function',
    );
  } catch {
    return false;
  }
}

/** Tunggu injeksi WWebJS (setelah event `ready` / sync WA Web). */
export async function waitForWhatsAppStoreReady(
  client: Client,
  maxMs: number = WA_STORE_WAIT_MS,
): Promise<void> {
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    if (await isWWebJsReady(client)) return;

    const state = await client.getState().catch(() => null);
    if (state && state !== 'CONNECTED') {
      throw new Error(`WA_NOT_CONNECTED: WhatsApp is not connected (${state}). Log in again.`);
    }

    await new Promise<void>((resolve) => {
      const done = () => {
        client.off('ready', done);
        resolve();
      };
      client.once('ready', done);
      setTimeout(done, WA_STORE_POLL_MS);
    });
  }

  if (await isWWebJsReady(client)) return;

  throw new Error(
    'WA_STORE_NOT_READY: WhatsApp Web masih sync. Tunggu hingga login selesai (beberapa detik), lalu jalankan scraper lagi.',
  );
}

export function assertWhatsAppScrapeClient(client: Client | null | undefined): asserts client is Client {
  if (!client) {
    throw new Error('WA_CLIENT_NOT_READY: WhatsApp client lost during scrape. Log in again.');
  }
  if (!client.pupPage) {
    throw new Error(
      'WA_CLIENT_NOT_READY: WhatsApp browser session not initialized. Wait for login to finish.',
    );
  }
  if (typeof client.getChatById !== 'function') {
    throw new Error('WA_CLIENT_NOT_READY: WhatsApp client API unavailable. Try again.');
  }
}

/**
 * Grup yang masih ada di akun = masih member + ada participant.
 * Chat yang sudah leave/delete tidak masuk (progress scrape = jumlah real saja).
 */
async function listLiveWhatsAppGroupIdsFromStore(client: Client): Promise<string[]> {
  return client.pupPage.evaluate(() => {
    const chats = window.require('WAWebCollections').Chat.getModelsArray();
    const getters = window.require('WAWebContactGetters');
    const mePrefs = window.require('WAWebUserPrefsMeUser');
    const mePn = mePrefs.getMaybeMePnUser?.();
    const meLid = mePrefs.getMaybeMeLidUser?.();

    function widSerialized(w: unknown): string {
      if (!w || typeof w !== 'object') return String(w ?? '').trim();
      const o = w as { _serialized?: string; id?: { _serialized?: string } };
      return String(o._serialized ?? o.id?._serialized ?? '').trim();
    }
    function digitsOfWid(w: unknown): string {
      const s = widSerialized(w);
      return s.split('@')[0]?.replace(/\D/g, '') ?? '';
    }
    function sameParticipant(a: unknown, b: unknown): boolean {
      const sa = widSerialized(a);
      const sb = widSerialized(b);
      if (!sa || !sb) return false;
      if (sa === sb) return true;
      const da = digitsOfWid(a);
      const db = digitsOfWid(b);
      return da.length >= 8 && db.length >= 8 && da === db;
    }
    function listParticipants(chat: {
      groupMetadata?: {
        participants?: {
          serialize?: () => Array<{ id?: unknown }>;
          getModelsArray?: () => unknown[];
          _models?: Array<{ serialize?: () => { id?: unknown } }>;
          forEach?: (fn: (p: { serialize?: () => { id?: unknown } }) => void) => void;
        };
      };
    }): Array<{ id?: unknown }> {
      const raw = chat.groupMetadata?.participants;
      if (!raw) return [];
      if (typeof raw.serialize === 'function') {
        try {
          return raw.serialize() || [];
        } catch {
          /* fall through */
        }
      }
      if (Array.isArray(raw._models)) {
        return raw._models.map((m) => (m.serialize ? m.serialize() : (m as { id?: unknown })));
      }
      if (typeof raw.getModelsArray === 'function') {
        try {
          return (raw.getModelsArray() || []) as Array<{ id?: unknown }>;
        } catch {
          return [];
        }
      }
      const out: Array<{ id?: unknown }> = [];
      if (typeof raw.forEach === 'function') {
        raw.forEach((p) => out.push(p.serialize ? p.serialize() : p));
      }
      return out;
    }

    const out: string[] = [];
    for (const chat of chats) {
      const serialized = String(
        chat?.id?._serialized ?? (typeof chat?.id === 'string' ? chat.id : '') ?? '',
      ).trim();
      const isGroup =
        (typeof getters.getIsGroup === 'function' && getters.getIsGroup(chat)) ||
        Boolean(chat.groupMetadata) ||
        serialized.endsWith('@g.us');
      if (!isGroup || !serialized) continue;

      const participants = listParticipants(chat);
      if (participants.length === 0) continue;

      let meInGroup = false;
      for (const p of participants) {
        const pid = p.id ?? p;
        if (sameParticipant(pid, mePn) || sameParticipant(pid, meLid)) {
          meInGroup = true;
          break;
        }
      }
      if (!meInGroup) continue;

      out.push(serialized);
    }
    return out;
  });
}

/** Hitung total grup di akun — hanya yang masih member. */
export async function countWhatsAppGroupsOnDevice(
  client: Client,
  options?: { storeWaitMs?: number },
): Promise<number> {
  assertWhatsAppScrapeClient(client);
  await waitForWhatsAppStoreReady(client, options?.storeWaitMs);
  const ids = await listLiveWhatsAppGroupIdsFromStore(client);
  return ids.length;
}

/** Setelah cold-boot — tunggu jumlah grup di store stabil (WA Web selesai sync inbox).
 *  Kontrak akun besar (1900–6000): count 0 bukan siap; naik terus = belum siap;
 *  baru scrape setelah count > 0 dan tidak naik selama N round (N naik ikut ukuran akun).
 */
export async function waitForWhatsAppInboxStable(
  client: Client,
  options?: {
    maxMs?: number;
    pollMs?: number;
    stableRounds?: number;
    sessionId?: string;
    /** Minimal grup yang harus muncul sebelum dianggap sync mulai (default 1). */
    minGroups?: number;
  },
): Promise<number> {
  assertWhatsAppScrapeClient(client);
  const maxMs = options?.maxMs ?? 120_000;
  const pollMs = options?.pollMs ?? 5_000;
  const minGroups = Math.max(1, options?.minGroups ?? 1);
  const sessionId = options?.sessionId;
  const deadline = Date.now() + maxMs;
  let lastCount = -1;
  let stable = 0;
  let peakCount = 0;

  while (Date.now() < deadline) {
    const count = await countWhatsAppGroupsOnDevice(client);
    peakCount = Math.max(peakCount, count);
    const needRounds =
      options?.stableRounds ??
      (count >= 2000 ? 8 : count >= 500 ? 6 : count >= 100 ? 4 : 3);

    if (sessionId) {
      touchScrapeWatchdog(sessionId);
      emitScrapeProgress({
        sessionId,
        phase: 'connect',
        label: `Waiting for inbox sync (${count} groups so far · peak ${peakCount})…`,
      });
    }

    // Count 0 = belum sync. Count naik = masih sync. Hanya stabil + count>0 = siap.
    if (count >= minGroups && count === lastCount) {
      stable += 1;
      if (stable >= needRounds) {
        // Konfirmasi ekstra untuk akun besar — 1 poll lagi supaya grup terlambat ikut masuk.
        if (count >= 500) {
          await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
          const confirm = await countWhatsAppGroupsOnDevice(client);
          peakCount = Math.max(peakCount, confirm);
          if (confirm > count) {
            stable = 0;
            lastCount = confirm;
            continue;
          }
          return Math.max(count, confirm);
        }
        return count;
      }
    } else {
      stable = 0;
      lastCount = count;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollMs);
    });
  }

  const finalCount = await countWhatsAppGroupsOnDevice(client).catch(() =>
    Math.max(lastCount, peakCount),
  );
  peakCount = Math.max(peakCount, finalCount);

  if (finalCount >= minGroups) {
    // Jangan scrape kalau peak jauh lebih tinggi dari final (store mundur / belum lengkap).
    if (peakCount > 50 && finalCount < Math.floor(peakCount * 0.85)) {
      throw new Error(
        `SCRAPER_INCOMPLETE: WhatsApp inbox unstable before scrape (final=${finalCount}, peak=${peakCount}). Wait a few minutes, then Scrape Now again.`,
      );
    }
    return finalCount;
  }

  throw new Error(
    `SCRAPER_INCOMPLETE: WhatsApp inbox still empty after sync wait (last count=${finalCount}, peak=${peakCount}). Wait a few minutes, then Scrape Now again.`,
  );
}

/** Daftar JID grup di akun — hanya yang masih member. */
export async function listWhatsAppGroupIds(
  client: Client,
  options?: { storeWaitMs?: number },
): Promise<string[]> {
  assertWhatsAppScrapeClient(client);
  await waitForWhatsAppStoreReady(client, options?.storeWaitMs);

  const ids = await listLiveWhatsAppGroupIdsFromStore(client);
  const unique = Array.from(new Set(ids));
  if (unique.length > WA_STORE_GROUP_LIST_CAP) {
    console.warn(
      `[wa-groups] ${unique.length} groups on account; capping list at ${WA_STORE_GROUP_LIST_CAP}`,
    );
    return unique.slice(0, WA_STORE_GROUP_LIST_CAP);
  }

  if (unique.length > DEVICE_GROUP_TARGET_MAX) {
    console.info(
      `[wa-groups] Large account: ${unique.length} groups (prepared for up to ${DEVICE_GROUP_TARGET_MAX}+)`,
    );
  }

  return unique;
}
