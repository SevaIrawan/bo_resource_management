import pkg from 'whatsapp-web.js';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import { fetchWhatsAppGroupInviteLink } from '../scraper/whatsappGroupInviteLink';
import { waitForWhatsAppStoreReady } from '../scraper/whatsappGroupDiscovery';
import { withPromiseTimeout } from './promiseTimeout';
import { resolveJoinGroups, resolveSetAdminGroups } from './jobQueueBatchHelpers';
import { peekJobStopRequest } from './jobQueueStore';
import { runWaDeleteGroupChat } from './waDeleteGroupChat';
import { runWaExitDeleteGroup } from './waExitDeleteGroup';
import { runWaLeaveGroup } from './waLeaveGroup';
import { runWaSetGroupPhoto } from './waSetGroupPhoto';
import type {
  AutomationProgressCallback,
  AutomationRunPayload,
  AutomationRunResult,
  WaCreateGroupSettings,
} from './types';

const WA_ACCEPT_INVITE_TIMEOUT_MS = 120_000;
const WA_CHAT_LOOKUP_TIMEOUT_MS = 90_000;
const WA_PROMOTE_TIMEOUT_MS = 90_000;
const WA_DETACHED_FRAME_RETRY_MS = 1_200;
const WA_DETACHED_FRAME_MAX_ATTEMPTS = 3;

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

function isDetachedFrameError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return lower.includes('navigating frame was detached') || lower.includes('detached frame');
}

async function withDetachedFrameRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < WA_DETACHED_FRAME_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isDetachedFrameError(error) || attempt === WA_DETACHED_FRAME_MAX_ATTEMPTS - 1) {
        throw error;
      }
      console.warn(`[wa-automation] ${label} detached frame — retry ${attempt + 1}`);
      await sleep(WA_DETACHED_FRAME_RETRY_MS * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
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

async function applyWaCreateGroupSettings(
  chat: {
    setMessagesAdminsOnly?: (value: boolean) => Promise<boolean>;
    setAddMembersAdminsOnly?: (value: boolean) => Promise<boolean>;
    setInfoAdminsOnly?: (value: boolean) => Promise<boolean>;
  },
  settings?: WaCreateGroupSettings,
): Promise<void> {
  if (!settings) return;
  if (typeof chat.setMessagesAdminsOnly === 'function') {
    await chat.setMessagesAdminsOnly(Boolean(settings.messagesAdminsOnly));
  }
  if (typeof chat.setAddMembersAdminsOnly === 'function') {
    await chat.setAddMembersAdminsOnly(Boolean(settings.addMembersAdminsOnly));
  }
  if (typeof chat.setInfoAdminsOnly === 'function') {
    await chat.setInfoAdminsOnly(Boolean(settings.infoAdminsOnly));
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

  const batchIndex = Math.max(1, Math.floor(payload.batchIndex ?? 1));
  if (batchIndex > 1) {
    const betweenSec = payload.delay?.between_groups_sec ?? 120;
    await sleep(jitterMs(betweenSec * 1000, payload.delay?.jitter_percent));
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

  const gid =
    created.gid?._serialized ??
    (created as { id?: { _serialized?: string } }).id?._serialized ??
    '';

  const chat = gid ? await client.getChatById(gid) : null;
  if (chat && 'groupMetadata' in chat) {
    try {
      await applyWaCreateGroupSettings(
        chat as {
          setMessagesAdminsOnly?: (value: boolean) => Promise<boolean>;
          setAddMembersAdminsOnly?: (value: boolean) => Promise<boolean>;
          setInfoAdminsOnly?: (value: boolean) => Promise<boolean>;
        },
        payload.createGroupSettings,
      );
    } catch (err) {
      console.warn('[wa-automation] apply create group settings failed:', err);
    }
  }

  const afterCreateSec = payload.delay?.after_create_sec ?? 90;
  await sleep(jitterMs(afterCreateSec * 1000, payload.delay?.jitter_percent));

  const groupId = gid.replace(/@g\.us$/i, '');
  const invite_link = gid ? await fetchWhatsAppGroupInviteLink(client, gid) : null;

  return {
    status: 'ok',
    action: 'create_group',
    message: groupId ? `${groupName} (${groupId})` : groupName,
    result: {
      group_id: groupId,
      group_name: groupName,
      invite_link,
      participant_count: participants.length,
    },
  };
}

async function runSetAdmin(
  client: InstanceType<typeof Client>,
  payload: AutomationRunPayload,
  onProgress?: AutomationProgressCallback,
  options?: { skipStoreReady?: boolean },
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

  if (!options?.skipStoreReady) {
    await waitForWhatsAppStoreReady(client);
  }
  onProgress?.(0, targets.length, 'Loading group…');
  const chatId = normalizeGroupChatId(groupRef);
  const chat = await withDetachedFrameRetry('getChatById', () =>
    withPromiseTimeout(client.getChatById(chatId), WA_CHAT_LOOKUP_TIMEOUT_MS, 'getChatById'),
  );
  if (!chat.isGroup) {
    return {
      status: 'error',
      action: 'set_admin',
      message: 'Not a group chat',
      errorCode: 'GROUP_NOT_FOUND',
    };
  }

  const participantIds = targets.map(toWaParticipantId);
  const maxSlots = Math.max(1, Math.floor(payload.delay?.max_admin_slots ?? 5));
  const limitedIds = participantIds.slice(0, maxSlots);
  const promoted: string[] = [];
  const errors: Array<{ target: string; error: string }> = [];

  for (let i = 0; i < limitedIds.length; i += 1) {
    const target = limitedIds[i];
    onProgress?.(i, limitedIds.length, `Promote ${target.replace(/@.*/, '')}`);
    try {
      await withDetachedFrameRetry('promoteParticipants', () =>
        withPromiseTimeout(
          chat.promoteParticipants([target]),
          WA_PROMOTE_TIMEOUT_MS,
          'promoteParticipants',
        ),
      );
      promoted.push(target);
      onProgress?.(i + 1, limitedIds.length, `Promoted ${target.replace(/@.*/, '')}`);
    } catch (err) {
      errors.push({
        target,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (i < limitedIds.length - 1) {
      const baseSec = (payload.delay?.between_targets_sec ?? 3) * 1000;
      await sleep(jitterMs(baseSec, payload.delay?.jitter_percent));
    }
  }

  return {
    status: promoted.length ? 'ok' : 'error',
    action: 'set_admin',
    message: promoted.length
      ? `Promoted ${promoted.length}/${limitedIds.length} in ${chatId.replace(/@g\.us$/i, '')}`
      : errors[0]?.error ?? 'No targets promoted',
    errorCode: promoted.length ? undefined : 'SET_ADMIN_FAILED',
    result: { promoted, errors, group_id: chatId.replace(/@g\.us$/i, '') },
  };
}

function randomBetweenSec(minSec: number, maxSec: number): number {
  const low = Math.min(minSec, maxSec);
  const high = Math.max(minSec, maxSec);
  if (high <= low) return low;
  return low + Math.random() * (high - low);
}

async function applyJoinInviteDelay(payload: AutomationRunPayload): Promise<void> {
  const delay = payload.delay;
  const seq = Math.max(1, Math.floor(payload.joinSequenceIndex ?? 1));
  const batchEvery = Math.max(1, Math.floor(delay?.invite_batch_every ?? 10));

  if (seq > 1 && batchEvery > 0 && seq % batchEvery === 0) {
    const sec = randomBetweenSec(
      delay?.invite_batch_delay_min_sec ?? 180,
      delay?.invite_batch_delay_max_sec ?? 360,
    );
    await sleep(jitterMs(sec * 1000, delay?.jitter_percent));
    return;
  }

  const sec = randomBetweenSec(
    delay?.invite_delay_min_sec ?? 30,
    delay?.invite_delay_max_sec ?? 60,
  );
  await sleep(jitterMs(sec * 1000, delay?.jitter_percent));
}

async function runJoinByInviteLink(
  client: InstanceType<typeof Client>,
  payload: AutomationRunPayload,
  onProgress?: AutomationProgressCallback,
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
  onProgress?.(0, 1, 'Waiting before join…');
  await applyJoinInviteDelay(payload);

  onProgress?.(0, 1, 'Accepting invite link…');
  try {
    const chatId = await withPromiseTimeout(
      client.acceptInvite(code),
      WA_ACCEPT_INVITE_TIMEOUT_MS,
      'acceptInvite',
    );
    const chat = chatId
      ? await withPromiseTimeout(
          client.getChatById(chatId),
          WA_CHAT_LOOKUP_TIMEOUT_MS,
          'getChatById',
        )
      : null;
    onProgress?.(1, 1, chat?.name?.trim() || 'Joined');
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

function buildBatchStopResult(input: {
  created: number;
  totalTarget: number;
  failed: string[];
  groupOutcomes: Array<{
    groupId: string;
    groupName?: string;
    inviteLink?: string;
    createStatus: 'created' | 'failed';
  }>;
}): AutomationRunResult {
  const { created, totalTarget, failed, groupOutcomes } = input;
  return {
    status: created > 0 ? 'ok' : 'error',
    action: 'create_group',
    message: 'Stopped by user',
    errorCode: 'JOB_STOPPED',
    result: { success: created, total: totalTarget, failed, groupOutcomes },
  };
}

function isJobStopRequested(jobId?: string): boolean {
  return Boolean(jobId && peekJobStopRequest(jobId));
}

function pauseBetweenRunsMs(delay?: AutomationRunPayload['delay']): number {
  const minSec = delay?.pause_between_runs_min_sec ?? 45 * 60;
  const maxSec = delay?.pause_between_runs_max_sec ?? 65 * 60;
  const low = Math.min(minSec, maxSec);
  const high = Math.max(minSec, maxSec);
  if (high <= low) return low * 1000;
  const picked = low + Math.floor(Math.random() * (high - low + 1));
  return picked * 1000;
}

export async function runWhatsAppCreateGroupBatch(
  payload: AutomationRunPayload,
  onProgress: (current: number, total: number, label: string) => void,
): Promise<AutomationRunResult> {
  const totalTarget = Math.max(1, Math.floor(Number(payload.totalToCreate) || 1));
  const perRun = Math.max(1, Math.floor(Number(payload.perRun) || totalTarget));
  const startFrom = Math.max(1, Math.floor(Number(payload.startFrom) || 1));
  const prefix = (payload.groupNamePrefix ?? payload.groupName ?? '').trim();

  if (!prefix) {
    return {
      status: 'error',
      action: 'create_group',
      message: 'groupName required',
      errorCode: 'INVALID_PAYLOAD',
    };
  }

  return withWhatsAppClient(
    payload.sessionId,
    async (client) => {
      await assertWhatsAppAccount(client, payload.expectedPhone);
      let created = 0;
      let nextNum = startFrom;
      const failed: string[] = [];
      const groupOutcomes: Array<{
        groupId: string;
        groupName?: string;
        inviteLink?: string;
        createStatus: 'created' | 'failed';
      }> = [];

      onProgress(0, totalTarget, prefix);

      while (created < totalTarget) {
        if (isJobStopRequested(payload.jobId)) {
          return buildBatchStopResult({ created, totalTarget, failed, groupOutcomes });
        }

        const createdBeforeSlice = created;
        const sliceSize = Math.min(perRun, totalTarget - created);

        for (let i = 0; i < sliceSize; i += 1) {
          if (isJobStopRequested(payload.jobId)) {
            return buildBatchStopResult({ created, totalTarget, failed, groupOutcomes });
          }

          const num = nextNum + i;
          const groupName = totalTarget > 1 ? `${prefix} ${num}`.trim() : prefix;
          const batchIndex = created + 1;

          onProgress(created, totalTarget, groupName);

          const result = await runCreateGroup(client, {
            ...payload,
            groupName,
            batchIndex,
          });

          if (result.status === 'ok') {
            created += 1;
            const detail = result.result ?? {};
            groupOutcomes.push({
              groupId: String(detail.group_id ?? '').trim(),
              groupName: String(detail.group_name ?? groupName).trim() || groupName,
              inviteLink:
                typeof detail.invite_link === 'string' ? detail.invite_link : undefined,
              createStatus: 'created',
            });
            onProgress(created, totalTarget, groupName);
          } else {
            failed.push(`${groupName}: ${result.message ?? 'failed'}`);
            groupOutcomes.push({
              groupId: '',
              groupName,
              createStatus: 'failed',
            });
          }
        }

        nextNum += sliceSize;

        if (created >= totalTarget) break;

        if (created === createdBeforeSlice) {
          console.warn(
            `[wa-automation] batch slice produced 0 creates (${created}/${totalTarget}); stopping`,
          );
          break;
        }

        console.warn(
          `[wa-automation] batch slice done ${created}/${totalTarget}; pause before next slice`,
        );
        await sleep(pauseBetweenRunsMs(payload.delay));
      }

      return {
        status: created > 0 ? 'ok' : 'error',
        action: 'create_group',
        message:
          failed.length > 0
            ? `${created}/${totalTarget} created (${failed.length} failed)`
            : `${created}/${totalTarget} created`,
        errorCode: created > 0 ? undefined : 'CREATE_GROUP_BATCH_FAILED',
        result: { success: created, total: totalTarget, failed, groupOutcomes },
      };
    },
    { purpose: 'operation' },
  );
}

export async function runWhatsAppAutomation(
  payload: AutomationRunPayload,
  onProgress?: AutomationProgressCallback,
): Promise<AutomationRunResult> {
  if (payload.action === 'exit_delete_group') {
    return runWaExitDeleteGroup(payload, onProgress);
  }
  if (payload.action === 'leave_group') {
    return runWaLeaveGroup(payload, onProgress);
  }
  if (payload.action === 'delete_group') {
    return runWaDeleteGroupChat(payload, onProgress);
  }
  if (payload.action === 'set_group_photo') {
    return runWaSetGroupPhoto(payload, onProgress);
  }

  const joinGroups = payload.action === 'join_by_invite_link' ? resolveJoinGroups(payload) : [];
  const adminGroups = payload.action === 'set_admin' ? resolveSetAdminGroups(payload) : [];

  if (payload.action === 'join_by_invite_link' && joinGroups.length > 0) {
    return withWhatsAppClient(
      payload.sessionId,
      async (client) => {
        await assertWhatsAppAccount(client, payload.expectedPhone);
        let success = 0;
        const failed: string[] = [];
        for (let i = 0; i < joinGroups.length; i += 1) {
          const group = joinGroups[i];
          onProgress?.(i, joinGroups.length, group.groupName ?? group.groupId);
          const result = await runJoinByInviteLink(
            client,
            {
              ...payload,
              groupId: group.groupId,
              groupName: group.groupName,
              inviteLink: group.inviteLink,
              joinSequenceIndex: i + 1,
            },
            onProgress,
          );
          if (result.status === 'ok') {
            success += 1;
            onProgress?.(i + 1, joinGroups.length, group.groupName ?? 'Joined');
          } else {
            failed.push(`${group.groupName ?? group.groupId}: ${result.message ?? 'failed'}`);
          }
        }
        return {
          status: success > 0 ? 'ok' : 'error',
          action: 'join_by_invite_link',
          message: `${success}/${joinGroups.length} joined`,
          errorCode: success > 0 ? undefined : 'JOIN_BATCH_FAILED',
          result: { success, total: joinGroups.length, failed },
        };
      },
      { purpose: 'operation' },
    );
  }

  if (payload.action === 'set_admin' && adminGroups.length > 0) {
    return withWhatsAppClient(
      payload.sessionId,
      async (client) => {
        await assertWhatsAppAccount(client, payload.expectedPhone);
        await waitForWhatsAppStoreReady(client);
        let success = 0;
        const failed: string[] = [];
        for (let i = 0; i < adminGroups.length; i += 1) {
          const group = adminGroups[i];
          onProgress?.(i, adminGroups.length, group.groupName ?? group.groupId);
          const result = await runSetAdmin(
            client,
            {
              ...payload,
              groupId: group.groupId,
              groupName: group.groupName,
              groupLink: group.groupLink,
            },
            onProgress,
            { skipStoreReady: true },
          );
          if (result.status === 'ok') {
            success += 1;
            onProgress?.(i + 1, adminGroups.length, group.groupName ?? 'Done');
          } else {
            failed.push(`${group.groupName ?? group.groupId}: ${result.message ?? 'failed'}`);
          }
          if (i < adminGroups.length - 1) {
            const sec = randomBetweenSec(
              payload.delay?.invite_delay_min_sec ?? 5,
              payload.delay?.invite_delay_max_sec ?? 12,
            );
            await sleep(jitterMs(sec * 1000, payload.delay?.jitter_percent));
          }
        }
        return {
          status: success > 0 ? 'ok' : 'error',
          action: 'set_admin',
          message: `Promoted targets in ${success}/${adminGroups.length} groups`,
          errorCode: success > 0 ? undefined : 'SET_ADMIN_BATCH_FAILED',
          result: { success, total: adminGroups.length, failed },
        };
      },
      { purpose: 'operation' },
    );
  }

  onProgress?.(0, 1, 'Opening WhatsApp…');

  return withWhatsAppClient(
    payload.sessionId,
    async (client) => {
      await assertWhatsAppAccount(client, payload.expectedPhone);

      if (payload.action === 'create_group') {
        return runCreateGroup(client, payload);
      }
      if (payload.action === 'set_admin') {
        return runSetAdmin(client, payload, onProgress);
      }
      if (payload.action === 'join_by_invite_link') {
        return runJoinByInviteLink(client, payload, onProgress);
      }

      return {
        status: 'error',
        action: payload.action,
        message: `Unknown action: ${payload.action}`,
        errorCode: 'UNKNOWN_ACTION',
      };
    },
    { purpose: 'operation' },
  );
}
