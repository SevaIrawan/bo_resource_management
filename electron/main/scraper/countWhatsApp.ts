import { withWhatsAppClient } from '../platformLogin/whatsapp';
import { fetchGroupParticipants, meParticipantStats } from './whatsappParticipants';
import { isWhatsAppGroupChat } from './whatsappGroupFilter';
import {
  assertWhatsAppScrapeClient,
  listWhatsAppGroupIds,
} from './whatsappGroupDiscovery';

export async function countWhatsAppGroups(sessionId: string): Promise<{
  valid: boolean;
  totalGroups: number;
  adminGroups: number;
  message?: string;
}> {
  try {
    return await withWhatsAppClient(sessionId, async (client) => {
      assertWhatsAppScrapeClient(client);

      const state = await client.getState();
      if (state !== 'CONNECTED') {
        return {
          valid: false,
          totalGroups: 0,
          adminGroups: 0,
          message: 'WhatsApp session is not connected',
        };
      }

      const groupIds = await listWhatsAppGroupIds(client);
      const meId = client.info?.wid?._serialized;
      let adminGroups = 0;
      let totalGroups = 0;

      for (const groupId of groupIds) {
        const chat = await client.getChatById(groupId);
        if (!chat || !isWhatsAppGroupChat(chat)) continue;
        totalGroups += 1;

        const participants = await fetchGroupParticipants(client, chat);
        const stats = meParticipantStats(participants, meId);
        if (stats.isAdmin) adminGroups += 1;
      }

      return {
        valid: true,
        totalGroups,
        adminGroups,
      };
    });
  } catch (error) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: error instanceof Error ? error.message : 'WhatsApp count failed',
    };
  }
}
