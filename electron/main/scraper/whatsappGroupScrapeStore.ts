import type { Client } from 'whatsapp-web.js';
import type { ScrapedGroupRow } from './index';
import { assertWhatsAppScrapeClient } from './whatsappGroupDiscovery';

export type WhatsAppGroupScrapeSkip = { skip: true; reason: string };

export type WhatsAppGroupScrapeCore = Omit<ScrapedGroupRow, 'invite_link'>;

export type WhatsAppGroupScrapeStoreResult = WhatsAppGroupScrapeCore | WhatsAppGroupScrapeSkip;

export type WhatsAppGroupScrapeOptions = {
  /** Default 6 (harvest); repair pass uses 3. */
  maxAttempts?: number;
};

const FULL_RETRY_DELAYS_MS = [500, 900, 1400, 2000, 2800, 3600];
const QUICK_RETRY_DELAYS_MS = [350, 650, 1000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriablePuppeteerEvaluateError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes('protocolerror') ||
    lower.includes('callfunctionon timed out') ||
    lower.includes('detached frame') ||
    lower.includes('execution context was destroyed') ||
    lower.includes('target closed') ||
    lower.includes('session closed')
  );
}

async function evaluateWhatsAppGroupFromStore(
  client: Client,
  groupId: string,
  retryDelaysMs: number[],
): Promise<WhatsAppGroupScrapeStoreResult> {
  return client.pupPage.evaluate(
    async (gid, delays: number[]) => {
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

    type SerializedParticipant = {
      id?: unknown;
      isAdmin?: boolean;
      isSuperAdmin?: boolean;
    };

    type ChatRef = {
      formattedTitle?: string;
      name?: string;
      groupMetadata?: {
        participants?: {
          serialize?: () => SerializedParticipant[];
          forEach?: (fn: (p: { serialize?: () => SerializedParticipant }) => void) => void;
          _models?: Array<{ serialize?: () => SerializedParticipant }>;
        };
      };
      iAmAdmin?: () => boolean;
    };

    function listParticipants(chat: ChatRef): SerializedParticipant[] {
      const raw = chat.groupMetadata?.participants;
      if (!raw) return [];
      if (typeof raw.serialize === 'function') {
        return raw.serialize();
      }
      if (raw._models?.length) {
        return raw._models.map((m) => (m.serialize ? m.serialize() : (m as SerializedParticipant)));
      }
      const out: SerializedParticipant[] = [];
      if (typeof raw.forEach === 'function') {
        raw.forEach((p) => {
          out.push(p.serialize ? p.serialize() : (p as SerializedParticipant));
        });
      }
      return out;
    }

    async function refreshGroupMetadata(gid: string): Promise<void> {
      const GroupQueryJob = window.require('WAWebGroupQueryJob');
      const queryResult = GroupQueryJob.queryAndUpdateGroupMetadataById({ id: gid });
      if (queryResult && typeof (queryResult as Promise<unknown>).then === 'function') {
        await queryResult;
      }

      try {
        const legacy = window.require('WAWebGroupQueryAndUpdate') as
          | ((input: { id: string }) => Promise<unknown> | unknown)
          | undefined;
        if (typeof legacy === 'function') {
          const legacyResult = legacy({ id: gid });
          if (legacyResult && typeof (legacyResult as Promise<unknown>).then === 'function') {
            await legacyResult;
          }
        }
      } catch {
        // optional — not all WA Web builds expose this module
      }
    }

    async function trySyncChatHistory(gid: string): Promise<void> {
      try {
        const chatModel = (await window.WWebJS.getChat(gid, { getAsModel: true })) as {
          syncHistory?: () => Promise<unknown>;
        } | null;
        if (chatModel && typeof chatModel.syncHistory === 'function') {
          await chatModel.syncHistory();
        }
      } catch {
        // optional repair path
      }
    }

    let chat = (await window.WWebJS.getChat(gid, { getAsModel: false })) as ChatRef | null;
    if (!chat?.groupMetadata) {
      return { skip: true as const, reason: 'not_group' };
    }

    const mePrefs = window.require('WAWebUserPrefsMeUser') as {
      getMaybeMePnUser?: () => unknown;
      getMaybeMeLidUser?: () => unknown;
    };
    const mePn = mePrefs.getMaybeMePnUser?.();
    const meLid = mePrefs.getMaybeMeLidUser?.();

    const retryDelaysMs = delays;
    let participants: SerializedParticipant[] = [];
    let meEntry: SerializedParticipant | undefined;

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
      await refreshGroupMetadata(gid);

      if (attempt >= 2) {
        await trySyncChatHistory(gid);
      }

      chat = ((await window.WWebJS.getChat(gid, { getAsModel: false })) as ChatRef | null) ?? chat;
      if (!chat?.groupMetadata) {
        if (attempt === retryDelaysMs.length - 1) {
          return { skip: true as const, reason: 'metadata_missing' };
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, retryDelaysMs[attempt]);
        });
        continue;
      }

      participants = listParticipants(chat);
      meEntry = undefined;
      for (const p of participants) {
        const pid = p.id ?? p;
        if (sameParticipant(pid, mePn) || sameParticipant(pid, meLid)) {
          meEntry = p;
          break;
        }
      }

      if (participants.length === 0) {
        if (attempt === retryDelaysMs.length - 1) {
          return { skip: true as const, reason: 'empty_participants' };
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, retryDelaysMs[attempt]);
        });
        continue;
      }

      if (participants.length > 0 && !meEntry) {
        return { skip: true as const, reason: 'not_member' };
      }

      if (participants.length > 1) break;

      if (attempt < retryDelaysMs.length - 1) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, retryDelaysMs[attempt]);
        });
      }
    }

    let isAdmin = false;
    if (typeof chat.iAmAdmin === 'function') {
      try {
        isAdmin = Boolean(chat.iAmAdmin());
      } catch {
        isAdmin = false;
      }
    }
    if (!isAdmin && meEntry) {
      isAdmin = Boolean(meEntry.isAdmin || meEntry.isSuperAdmin);
    }

    const ownerCount = participants.filter((p) => p.isSuperAdmin).length;
    const adminCount = participants.filter((p) => p.isAdmin && !p.isSuperAdmin).length;
    const memberCount = participants.length;
    const groupName = String(chat.formattedTitle ?? chat.name ?? gid).trim() || gid;

    return {
      group_id: gid,
      group_name: groupName,
      is_admin: isAdmin ? ('yes' as const) : ('no' as const),
      member_count: memberCount,
      admin_count: adminCount,
      owner_count: ownerCount,
    };
  }, groupId, retryDelaysMs);
}

/**
 * Satu grup: refresh metadata dari server WA (queryAndUpdateGroupMetadataById),
 * baca participant + admin LID-aware. Skip jika sudah tidak member.
 */
export async function scrapeWhatsAppGroupFromStore(
  client: Client,
  groupId: string,
  options?: WhatsAppGroupScrapeOptions,
): Promise<WhatsAppGroupScrapeStoreResult> {
  assertWhatsAppScrapeClient(client);

  const maxAttempts = Math.max(1, Math.min(6, options?.maxAttempts ?? FULL_RETRY_DELAYS_MS.length));
  const retryDelaysMs =
    maxAttempts <= QUICK_RETRY_DELAYS_MS.length
      ? QUICK_RETRY_DELAYS_MS.slice(0, maxAttempts)
      : FULL_RETRY_DELAYS_MS.slice(0, maxAttempts);

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      assertWhatsAppScrapeClient(client);
      return await evaluateWhatsAppGroupFromStore(client, groupId, retryDelaysMs);
    } catch (error) {
      lastError = error;
      if (!isRetriablePuppeteerEvaluateError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      await sleep(retryDelaysMs[attempt] ?? 1500);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('WA_STORE_EVALUATE_FAILED');
}
