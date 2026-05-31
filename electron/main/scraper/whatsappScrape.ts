import pkg from 'whatsapp-web.js';
import { ensureWhatsAppClient } from '../platformLogin/whatsapp';
import {
  fetchGroupParticipants,
  meParticipantStats,
} from './whatsappParticipants';
import type { ScrapedGroupRow } from './index';

const { Client } = pkg;

function adminLabel(isAdmin: boolean): 'yes' | 'no' {
  return isAdmin ? 'yes' : 'no';
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

export async function runWhatsAppScrape(sessionId: string): Promise<{
  ok: boolean;
  groups: ScrapedGroupRow[];
  count: number;
}> {
  const client = (await ensureWhatsAppClient(sessionId)) as InstanceType<typeof Client>;

  const state = await client.getState();
  if (state !== 'CONNECTED') {
    throw new Error(`WhatsApp is not connected (${state ?? 'unknown'}). Log in again.`);
  }

  const chats = await client.getChats();
  const groups = chats.filter((chat) => chat.isGroup);
  const rows: ScrapedGroupRow[] = [];
  const meId = client.info?.wid?._serialized;

  for (const chat of groups) {
    const participants = await fetchGroupParticipants(client, chat);
    const stats = meParticipantStats(participants, meId);
    const inviteLink = await resolveInviteLink(chat);

    rows.push({
      group_id: chat.id._serialized,
      group_name: chat.name ?? chat.id._serialized,
      invite_link: inviteLink,
      is_admin: adminLabel(stats.isAdmin),
      member_count: stats.memberCount,
      admin_count: stats.adminCount,
      owner_count: stats.ownerCount,
    });
  }

  return { ok: true, groups: rows, count: rows.length };
}
