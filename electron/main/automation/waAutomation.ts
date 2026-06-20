import pkg from 'whatsapp-web.js';
import { HUMAN_SETTLE_MEDIUM_MS, HUMAN_SETTLE_SHORT_MS } from '../lib/networkRetry';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import { waitForWhatsAppStoreReady } from '../scraper/whatsappGroupDiscovery';
import type { AutomationRunPayload, AutomationRunResult } from './types';

const { Client } = pkg;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs(baseMs: number, jitterPercent = 35): number {
  const jitter = jitterPercent / 100;
  const low = baseMs * (1 - jitter);
  const high = baseMs * (1 + jitter);
  return Math.max(100, Math.floor(low + Math.random() * (high - low)));
}

function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

function phonesMatch(a: string, b: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}

function toWaParticipantId(target: string): string {
  const value = target.trim();
  if (!value) return value;
  if (value.includes('@')) return value;
  const digits = normalizePhoneDigits(value);
  if (digits.length >= 8) return `${digits}@c.us`;
  return value;
}

function normalizeGroupChatId(groupId: string): string {
  const value = groupId.trim();
  if (!value) return value;
  if (value.includes('@')) return value;
  return `${value}@g.us`;
}

function extractWaInviteCode(link: string): string | null {
  const trimmed = link.trim();
  const match = trimmed.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

async function assertWhatsAppAccount(
  client: InstanceType<typeof Client>,
  expectedPhone?: string,
): Promise<void> {
  const loggedInAs =
    client.info?.wid?.user ??
    (client.info as { me?: { user?: string } } | undefined)?.me?.user ??
    '';
  if (expectedPhone?.trim() && loggedInAs) {
    if (!phonesMatch(loggedInAs, expectedPhone.trim())) {
      throw new Error(
        `WA_ACCOUNT_MISMATCH: logged in as ${loggedInAs}, expected ${expectedPhone.trim()}`,
      );
    }
  }
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

async function runCreateGroup(
  client: InstanceType<typeof Client>,
  payload: AutomationRunPayload,
): Promise<AutomationRunResult> {
  const groupName = payload.groupName?.trim();
  if (!groupName) {
    return {
      status: 'error',
      action: 'create_group',
      message: 'groupName required',
      errorCode: 'INVALID_PAYLOAD',
    };
  }

  await waitForWhatsAppStoreReady(client);
  const participants = (payload.initialParticipants ?? [])
    .map(toWaParticipantId)
    .filter(Boolean);

  const created = await client.createGroup(groupName, participants);
  if (typeof created === 'string') {
    return {
      status: 'error',
      action: 'create_group',
      message: created,
      errorCode: 'CREATE_GROUP_FAILED',
    };
  }

  await sleep(jitterMs(HUMAN_SETTLE_MEDIUM_MS, payload.delay?.jitter_percent));

  const gid =
    created.gid?._serialized ??
    (created as { id?: { _serialized?: string } }).id?._serialized ??
    '';
  const chat = gid ? await client.getChatById(gid) : null;
  const inviteLink = chat ? await resolveInviteLink(chat as { getInviteCode?: () => Promise<string> }) : null;

  return {
    status: 'ok',
    action: 'create_group',
    result: {
      group_id: gid.replace(/@g\.us$/i, ''),
      group_name: groupName,
      invite_link: inviteLink,
      participant_count: participants.length,
    },
  };
}

async function runSetAdmin(
  client: InstanceType<typeof Client>,
  payload: AutomationRunPayload,
): Promise<AutomationRunResult> {
  const targets = (payload.targets ?? []).map((t) => t.trim()).filter(Boolean);
  if (!targets.length) {
    return {
      status: 'error',
      action: 'set_admin',
      message: 'targets required',
      errorCode: 'INVALID_PAYLOAD',
    };
  }

  const groupRef = payload.groupId?.trim() || payload.groupLink?.trim();
  if (!groupRef) {
    return {
      status: 'error',
      action: 'set_admin',
      message: 'groupId required for WhatsApp',
      errorCode: 'INVALID_PAYLOAD',
    };
  }

  await waitForWhatsAppStoreReady(client);
  const chatId = normalizeGroupChatId(groupRef);
  const chat = await client.getChatById(chatId);
  if (!chat.isGroup) {
    return {
      status: 'error',
      action: 'set_admin',
      message: 'Not a group chat',
      errorCode: 'GROUP_NOT_FOUND',
    };
  }

  const participantIds = targets.map(toWaParticipantId);
  const promoted: string[] = [];
  const errors: Array<{ target: string; error: string }> = [];

  for (let i = 0; i < participantIds.length; i += 1) {
    const target = participantIds[i];
    try {
      await chat.promoteParticipants([target]);
      promoted.push(target);
    } catch (err) {
      errors.push({
        target,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (i < participantIds.length - 1) {
      const baseSec = (payload.delay?.between_targets_sec ?? 3) * 1000;
      await sleep(jitterMs(baseSec, payload.delay?.jitter_percent));
    }
  }

  return {
    status: promoted.length ? 'ok' : 'error',
    action: 'set_admin',
    message: promoted.length ? undefined : 'No targets promoted',
    errorCode: promoted.length ? undefined : 'SET_ADMIN_FAILED',
    result: { promoted, errors, group_id: chatId.replace(/@g\.us$/i, '') },
  };
}

async function runJoinByInviteLink(
  client: InstanceType<typeof Client>,
  payload: AutomationRunPayload,
): Promise<AutomationRunResult> {
  const link = payload.inviteLink?.trim();
  if (!link) {
    return {
      status: 'error',
      action: 'join_by_invite_link',
      message: 'inviteLink required',
      errorCode: 'INVALID_PAYLOAD',
    };
  }

  const code = extractWaInviteCode(link);
  if (!code) {
    return {
      status: 'error',
      action: 'join_by_invite_link',
      message: 'Unsupported WhatsApp invite link',
      errorCode: 'INVITE_UNSUPPORTED',
    };
  }

  await waitForWhatsAppStoreReady(client);
  await sleep(jitterMs(HUMAN_SETTLE_SHORT_MS, payload.delay?.jitter_percent));

  try {
    const chatId = await client.acceptInvite(code);
    const chat = chatId ? await client.getChatById(chatId) : null;
    return {
      status: 'ok',
      action: 'join_by_invite_link',
      result: {
        group_id: String(chatId ?? '').replace(/@g\.us$/i, ''),
        group_name: chat?.name ?? '',
        invite_link: link,
        already_member: false,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already/i.test(msg)) {
      return {
        status: 'ok',
        action: 'join_by_invite_link',
        result: { invite_link: link, already_member: true },
      };
    }
    return {
      status: 'error',
      action: 'join_by_invite_link',
      message: msg,
      errorCode: 'JOIN_FAILED',
    };
  }
}

export async function runWhatsAppAutomation(payload: AutomationRunPayload): Promise<AutomationRunResult> {
  return withWhatsAppClient(payload.sessionId, async (client) => {
    await assertWhatsAppAccount(client, payload.expectedPhone);

    if (payload.action === 'create_group') {
      return runCreateGroup(client, payload);
    }
    if (payload.action === 'set_admin') {
      return runSetAdmin(client, payload);
    }
    if (payload.action === 'join_by_invite_link') {
      return runJoinByInviteLink(client, payload);
    }

    return {
      status: 'error',
      action: payload.action,
      message: `Unknown action: ${payload.action}`,
      errorCode: 'UNKNOWN_ACTION',
    };
  });
}
