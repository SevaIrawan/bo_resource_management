import type { Client } from 'whatsapp-web.js';
import type { ScrapedGroupRow } from './index';
import { assertWhatsAppScrapeClient } from './whatsappGroupDiscovery';

export type WhatsAppGroupScrapeSkip = { skip: true; reason: string };

export type WhatsAppGroupScrapeCore = Omit<ScrapedGroupRow, 'invite_link'>;

export type WhatsAppGroupScrapeStoreResult = WhatsAppGroupScrapeCore | WhatsAppGroupScrapeSkip;

/**
 * Satu grup: refresh metadata dari server WA (queryAndUpdateGroupMetadataById),
 * baca participant + admin LID-aware. Skip jika sudah tidak member.
 */
export async function scrapeWhatsAppGroupFromStore(
  client: Client,
  groupId: string,
): Promise<WhatsAppGroupScrapeStoreResult> {
  assertWhatsAppScrapeClient(client);

  return client.pupPage.evaluate(async (gid) => {
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

    let chat = (await window.WWebJS.getChat(gid, { getAsModel: false })) as ChatRef | null;
    if (!chat?.groupMetadata) {
      return { skip: true as const, reason: 'not_group' };
    }

    await window
      .require('WAWebGroupQueryJob')
      .queryAndUpdateGroupMetadataById({ id: gid });

    chat = ((await window.WWebJS.getChat(gid, { getAsModel: false })) as ChatRef | null) ?? chat;
    if (!chat?.groupMetadata) {
      return { skip: true as const, reason: 'metadata_missing' };
    }

    const mePrefs = window.require('WAWebUserPrefsMeUser') as {
      getMaybeMePnUser?: () => unknown;
      getMaybeMeLidUser?: () => unknown;
    };
    const mePn = mePrefs.getMaybeMePnUser?.();
    const meLid = mePrefs.getMaybeMeLidUser?.();

    let participants = listParticipants(chat);
    let meEntry: SerializedParticipant | undefined;
    for (const p of participants) {
      const pid = p.id ?? p;
      if (sameParticipant(pid, mePn) || sameParticipant(pid, meLid)) {
        meEntry = p;
        break;
      }
    }

    if (participants.length > 0 && !meEntry) {
      return { skip: true as const, reason: 'not_member' };
    }

    if (participants.length === 0) {
      return { skip: true as const, reason: 'empty_participants' };
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
  }, groupId);
}
