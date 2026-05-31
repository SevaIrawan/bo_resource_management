import pkg from 'whatsapp-web.js';
import { ensureWhatsAppClient } from '../platformLogin/whatsapp';
import { fetchGroupParticipants, meParticipantStats } from './whatsappParticipants';

const { Client } = pkg;

export async function countWhatsAppGroups(sessionId: string): Promise<{
  valid: boolean;
  totalGroups: number;
  adminGroups: number;
  message?: string;
}> {
  try {
    const client = (await ensureWhatsAppClient(sessionId)) as InstanceType<typeof Client>;

    const state = await client.getState();
    if (state !== 'CONNECTED') {
      return {
        valid: false,
        totalGroups: 0,
        adminGroups: 0,
        message: 'WhatsApp session is not connected',
      };
    }

    const chats = await client.getChats();
    const groups = chats.filter((chat) => chat.isGroup);
    const meId = client.info?.wid?._serialized;
    let adminGroups = 0;

    for (const chat of groups) {
      const participants = await fetchGroupParticipants(client, chat);
      const stats = meParticipantStats(participants, meId);
      if (stats.isAdmin) adminGroups += 1;
    }

    return {
      valid: true,
      totalGroups: groups.length,
      adminGroups,
    };
  } catch (error) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: error instanceof Error ? error.message : 'WhatsApp count failed',
    };
  }
}
