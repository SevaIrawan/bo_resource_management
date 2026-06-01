import pkg from 'whatsapp-web.js';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import {
  fetchGroupParticipants,
  meParticipantStats,
} from './whatsappParticipants';
import type { ScrapedGroupRow } from './index';
import { isWhatsAppGroupChat } from './whatsappGroupFilter';
import {
  assertWhatsAppScrapeClient,
  listWhatsAppGroupIds,
  waitForWhatsAppStoreReady,
} from './whatsappGroupDiscovery';
import { emitScrapeProgress } from './scrapeProgress';

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
  emitScrapeProgress({ sessionId, phase: 'start' });

  try {
    return await withWhatsAppClient(sessionId, async (client) => {
      assertWhatsAppScrapeClient(client);

      emitScrapeProgress({ sessionId, phase: 'connect', label: 'Checking WhatsApp connection' });

      const waUser = client.info?.wid?.user ?? client.info?.me?.user ?? 'unknown';
      console.info(`[wa-scrape] sessionId=${sessionId} loggedInAs=${waUser}`);

      const state = await client.getState();
      if (state !== 'CONNECTED') {
        throw new Error(
          `WA_NOT_CONNECTED: WhatsApp is not connected (${state ?? 'unknown'}). Log in again.`,
        );
      }

      emitScrapeProgress({
        sessionId,
        phase: 'connect',
        label: 'Waiting for WhatsApp Web to finish syncing…',
      });
      await waitForWhatsAppStoreReady(client);

      emitScrapeProgress({ sessionId, phase: 'discover', label: 'Discovering groups on device' });
      const groupIds = await listWhatsAppGroupIds(client);
      const total = groupIds.length;

      emitScrapeProgress({
        sessionId,
        phase: 'discover',
        current: total,
        total,
        label: `${total} groups on device (${waUser})`,
      });

      const rows: ScrapedGroupRow[] = [];
      const meId = client.info?.wid?._serialized;

      for (let i = 0; i < groupIds.length; i += 1) {
        const groupId = groupIds[i];
        const chat = await client.getChatById(groupId);
        if (!chat || !isWhatsAppGroupChat(chat)) continue;

        const groupName = chat.name ?? chat.id._serialized;
        emitScrapeProgress({
          sessionId,
          phase: 'group',
          current: i + 1,
          total,
          label: groupName,
        });

        const participants = await fetchGroupParticipants(client, chat);
        const stats = meParticipantStats(participants, meId);
        const inviteLink = await resolveInviteLink(chat);

        rows.push({
          group_id: chat.id._serialized,
          group_name: groupName,
          invite_link: inviteLink,
          is_admin: adminLabel(stats.isAdmin),
          member_count: stats.memberCount,
          admin_count: stats.adminCount,
          owner_count: stats.ownerCount,
        });
      }

      emitScrapeProgress({
        sessionId,
        phase: 'done',
        current: rows.length,
        total: rows.length,
        label: `Scrape finished: ${rows.length} groups`,
      });

      return { ok: true, groups: rows, count: rows.length };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp scrape failed';
    emitScrapeProgress({ sessionId, phase: 'error', label: message });
    throw error;
  }
}
