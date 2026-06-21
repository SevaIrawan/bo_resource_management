import type { Client, GroupChat } from 'whatsapp-web.js';
import type { ScrapedGroupRow } from './index';
import { DEVICE_GROUP_TARGET_MAX, WA_SCRAPE_GROUP_DELAY_MS, WA_SCRAPE_GROUP_JITTER_MS } from './deviceGroupScale';
import { throwIfScrapeCancelled } from './scrapeCancel';

export type ScrapeGroupsProgress = (input: {
  current: number;
  total: number;
  label: string;
}) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function humanDelay(baseMs: number, jitterMs: number): Promise<void> {
  const extra = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  await sleep(baseMs + extra);
}

function normalizeDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

function widMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const da = normalizeDigits(a);
  const db = normalizeDigits(b);
  return da.length >= 8 && db.length >= 8 && da === db;
}

function isGroupChat(chat: unknown): chat is GroupChat {
  return Boolean(chat && typeof chat === 'object' && (chat as GroupChat).isGroup);
}

/**
 * Satu grup WA: baca GroupChat.participants + invite link jika admin.
 * Kontrak output: ScrapedGroupRow (group_id, group_name, invite_link, is_admin, counts).
 */
async function readGroupRow(
  group: GroupChat,
  myId: string | null,
): Promise<ScrapedGroupRow | null> {
  const groupId = group.id?._serialized?.trim();
  if (!groupId) return null;

  const groupName = String(group.name ?? '').trim() || groupId;
  const participants = Array.isArray(group.participants) ? group.participants : [];
  if (participants.length === 0) return null;

  const memberCount = participants.length;
  const ownerCount = participants.filter((p) => p.isSuperAdmin).length;
  const adminCount = participants.filter((p) => p.isAdmin && !p.isSuperAdmin).length;
  const me = myId
    ? participants.find((p) => widMatch(p.id?._serialized, myId))
    : undefined;
  const iAmAdmin = Boolean(me && (me.isAdmin || me.isSuperAdmin));

  let inviteLink: string | null = null;
  if (iAmAdmin && typeof group.getInviteCode === 'function') {
    try {
      const code = await group.getInviteCode();
      if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
    } catch {
      inviteLink = null;
    }
  }

  return {
    group_id: groupId,
    group_name: groupName,
    invite_link: inviteLink,
    is_admin: iAmAdmin ? 'yes' : 'no',
    member_count: memberCount,
    admin_count: adminCount,
    owner_count: ownerCount,
  };
}

const GET_CHATS_TIMEOUT_MS = 300_000;

async function loadGroupChats(client: Client): Promise<GroupChat[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const chats = await Promise.race([
      client.getChats(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('getChats timed out after 300s')),
          GET_CHATS_TIMEOUT_MS,
        );
      }),
    ]);
    return chats.filter(isGroupChat);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Scrape penuh: getChats → filter grup → baca sequential + jeda antar grup.
 * Satu session WA, cap DEVICE_GROUP_TARGET_MAX, progress via scraper:progress.
 */
export async function scrapeAllWhatsAppGroups(input: {
  client: Client;
  sessionId: string;
  onProgress?: ScrapeGroupsProgress;
}): Promise<{ rows: ScrapedGroupRow[]; skipped: number }> {
  const myId = input.client.info?.wid?._serialized ?? null;
  const groups = await loadGroupChats(input.client);
  const target = groups.slice(0, DEVICE_GROUP_TARGET_MAX);
  const total = target.length;
  const rows: ScrapedGroupRow[] = [];
  let skipped = 0;

  if (groups.length > DEVICE_GROUP_TARGET_MAX) {
    console.warn(
      `[wa-scrape] ${groups.length} groups; scraping first ${DEVICE_GROUP_TARGET_MAX}`,
    );
  }

  for (let index = 0; index < target.length; index += 1) {
    throwIfScrapeCancelled(input.sessionId);

    const group = target[index]!;
    let row: ScrapedGroupRow | null = null;
    try {
      row = await readGroupRow(group, myId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'read failed';
      console.warn(`[wa-scrape] skip ${group.name ?? index + 1}: ${message}`);
    }

    if (!row) {
      skipped += 1;
    } else {
      rows.push(row);
    }

    input.onProgress?.({
      current: index + 1,
      total,
      label: row
        ? `${row.group_name} (${index + 1}/${total})`
        : `${group.name ?? group.id?._serialized ?? 'group'} (${index + 1}/${total})`,
    });

    if (index < target.length - 1) {
      await humanDelay(WA_SCRAPE_GROUP_DELAY_MS, WA_SCRAPE_GROUP_JITTER_MS);
    }
  }

  return { rows, skipped };
}
