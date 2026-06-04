import { withWhatsAppClient } from '../platformLogin/whatsapp';
import { fetchGroupParticipants, meParticipantStats } from './whatsappParticipants';
import { isWhatsAppGroupChat } from './whatsappGroupFilter';
import {
  assertWhatsAppScrapeClient,
  listWhatsAppGroupIds,
} from './whatsappGroupDiscovery';
import {
  DEVICE_GROUP_TARGET_MAX,
  runPooled,
  WA_GROUP_PROCESS_CONCURRENCY,
} from './deviceGroupScale';
import { emitScrapeProgress } from './scrapeProgress';

async function countWhatsAppGroupsInner(
  sessionId: string,
  mode: 'quick' | 'full',
): Promise<{
  valid: boolean;
  totalGroups: number;
  adminGroups: number;
  groupIds?: string[];
  message?: string;
}> {
  return withWhatsAppClient(sessionId, async (client) => {
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

    emitScrapeProgress({
      sessionId,
      phase: 'discover',
      label: 'Reading group list from WhatsApp…',
    });

    const groupIds = await listWhatsAppGroupIds(client);
    const totalGroups = groupIds.length;

    emitScrapeProgress({
      sessionId,
      phase: 'discover',
      current: totalGroups,
      total: totalGroups,
      label: `${totalGroups} groups on device`,
    });

    if (mode === 'quick') {
      return {
        valid: true,
        totalGroups,
        adminGroups: 0,
      };
    }

    const meId = client.info?.wid?._serialized;
    const scanIds = groupIds.slice(0, DEVICE_GROUP_TARGET_MAX);

    const adminFlags = await runPooled(scanIds, WA_GROUP_PROCESS_CONCURRENCY, async (groupId, index) => {
      const chat = await client.getChatById(groupId);
      if (!chat || !isWhatsAppGroupChat(chat)) return false;

      const participants = await fetchGroupParticipants(client, chat);
      const stats = meParticipantStats(participants, meId);

      if ((index + 1) % 25 === 0 || index === scanIds.length - 1) {
        emitScrapeProgress({
          sessionId,
          phase: 'group',
          current: index + 1,
          total: scanIds.length,
          label: `Checking admin role (${index + 1}/${scanIds.length})…`,
        });
      }

      return stats.isAdmin;
    });

    const adminGroups = adminFlags.filter(Boolean).length;

    return {
      valid: true,
      totalGroups,
      adminGroups,
      groupIds,
    };
  });
}

/** Setelah login / sync — hitung total grup dari store (skala ~2000 dalam hitungan detik). */
export async function countWhatsAppGroupsQuick(sessionId: string): Promise<{
  valid: boolean;
  totalGroups: number;
  adminGroups: number;
  groupIds?: string[];
  message?: string;
}> {
  try {
    return await countWhatsAppGroupsInner(sessionId, 'quick');
  } catch (error) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: error instanceof Error ? error.message : 'WhatsApp count failed',
    };
  }
}

/** Sync manual penuh — total dari store + admin paralel (maks DEVICE_GROUP_TARGET_MAX). */
export async function countWhatsAppGroups(sessionId: string): Promise<{
  valid: boolean;
  totalGroups: number;
  adminGroups: number;
  groupIds?: string[];
  message?: string;
}> {
  try {
    return await countWhatsAppGroupsInner(sessionId, 'full');
  } catch (error) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: error instanceof Error ? error.message : 'WhatsApp count failed',
    };
  }
}
