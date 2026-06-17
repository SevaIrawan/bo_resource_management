import type { Chat, Client, GroupChat } from 'whatsapp-web.js';
import { scrapeWhatsAppGroupFromStore } from './whatsappGroupScrapeStore';

export interface WaGroupParticipant {
  id: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/** @deprecated Prefer scrapeWhatsAppGroupFromStore — server metadata + LID. */
export async function fetchGroupParticipants(
  client: Client,
  chat: Chat,
): Promise<WaGroupParticipant[]> {
  const group = chat as GroupChat;
  const groupId = group.id?._serialized;
  if (!groupId) return [];

  const core = await scrapeWhatsAppGroupFromStore(client, groupId);
  if ('skip' in core) {
    const meId = client.info?.wid?._serialized;
    if (meId) {
      return [{ id: meId, isAdmin: false, isSuperAdmin: false }];
    }
    return [];
  }

  const meId = client.info?.wid?._serialized ?? '';
  return [
    {
      id: meId,
      isAdmin: core.is_admin === 'yes',
      isSuperAdmin: false,
    },
  ];
}

function idsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const norm = (id: string) => id.split('@')[0]?.replace(/\D/g, '') ?? '';
  const da = norm(a);
  const db = norm(b);
  return da.length >= 8 && db.length >= 8 && da === db;
}

export function meParticipantStats(
  participants: WaGroupParticipant[],
  meId: string | undefined,
): { isAdmin: boolean; ownerCount: number; adminCount: number; memberCount: number } {
  const ownerCount = participants.filter((p) => p.isSuperAdmin).length;
  const adminCount = participants.filter((p) => p.isAdmin && !p.isSuperAdmin).length;
  const me = meId
    ? participants.find((p) => idsMatch(p.id, meId))
    : undefined;

  return {
    isAdmin: Boolean(me?.isAdmin || me?.isSuperAdmin),
    ownerCount,
    adminCount,
    memberCount: participants.length,
  };
}
