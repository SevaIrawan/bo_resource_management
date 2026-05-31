import type { Chat, Client, GroupChat } from 'whatsapp-web.js';

export interface WaGroupParticipant {
  id: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export async function fetchGroupParticipants(
  client: Client,
  chat: Chat,
): Promise<WaGroupParticipant[]> {
  const group = chat as GroupChat;
  const meId = client.info?.wid?._serialized;

  try {
    if (typeof group.getParticipants === 'function') {
      const list = await group.getParticipants();
      return list.map((p) => ({
        id: p.id._serialized,
        isAdmin: Boolean(p.isAdmin),
        isSuperAdmin: Boolean(p.isSuperAdmin),
      }));
    }
  } catch {
    // fall through to legacy participants array
  }

  const legacy = group.participants ?? [];
  if (legacy.length > 0) {
    return legacy.map((p) => ({
      id: p.id._serialized,
      isAdmin: Boolean(p.isAdmin),
      isSuperAdmin: Boolean(p.isSuperAdmin),
    }));
  }

  if (meId) {
    return [{ id: meId, isAdmin: false, isSuperAdmin: false }];
  }

  return [];
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
