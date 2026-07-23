import pkg from 'whatsapp-web.js';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import { withPromiseTimeout } from './promiseTimeout';
import { resolveLeaveDeleteGroups } from './jobQueueBatchHelpers';
import type {
  AutomationProgressCallback,
  AutomationRunPayload,
  AutomationRunResult,
} from './types';

const { Client } = pkg;

const WA_LEAVE_STEP_TIMEOUT_MS = 90_000;
const WA_DETACHED_FRAME_MAX_ATTEMPTS = 3;
const WA_DETACHED_FRAME_RETRY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs(baseMs: number, jitterPercent = 35): number {
  const jitter = jitterPercent / 100;
  const low = baseMs * (1 - jitter);
  const high = baseMs * (1 + jitter);
  return Math.max(100, Math.floor(low + Math.random() * (high - low)));
}

function normalizeGroupChatId(groupId: string): string {
  const value = groupId.trim();
  if (!value) return value;
  if (value.includes('@')) return value;
  return `${value}@g.us`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotFoundError(error: unknown): boolean {
  const msg = errorMessage(error).toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('invalid wid') ||
    msg.includes('wid error') ||
    msg.includes('no chat') ||
    msg.includes('chat not found')
  );
}

function isDetachedFrameError(error: unknown): boolean {
  const lower = errorMessage(error).toLowerCase();
  return lower.includes('navigating frame was detached') || lower.includes('detached frame');
}

async function withDetachedFrameRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < WA_DETACHED_FRAME_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isDetachedFrameError(error) || attempt === WA_DETACHED_FRAME_MAX_ATTEMPTS - 1) {
        throw error;
      }
      console.warn(`[wa-leave] ${label} detached frame — retry ${attempt + 1}`);
      await sleep(WA_DETACHED_FRAME_RETRY_MS * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

type WaGroupChat = Awaited<ReturnType<InstanceType<typeof Client>['getChatById']>> & {
  isGroup?: boolean;
  leave?: () => Promise<unknown>;
  id?: { _serialized?: string };
};

async function resolveGroupChat(
  client: InstanceType<typeof Client>,
  chatId: string,
): Promise<WaGroupChat | null> {
  try {
    const chat = (await withDetachedFrameRetry('getChatById', () =>
      withPromiseTimeout(client.getChatById(chatId), WA_LEAVE_STEP_TIMEOUT_MS, 'getChatById'),
    )) as WaGroupChat | null;
    if (chat?.isGroup) return chat;
    if (chat && !chat.isGroup) return null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    console.warn('[wa-leave] getChatById failed, trying getChats fallback:', errorMessage(error));
  }

  try {
    const chats = await withDetachedFrameRetry('getChats', () =>
      withPromiseTimeout(client.getChats(), WA_LEAVE_STEP_TIMEOUT_MS, 'getChats'),
    );
    const found = chats.find((row) => {
      const serialized = (row as WaGroupChat).id?._serialized ?? '';
      return Boolean((row as WaGroupChat).isGroup) && serialized === chatId;
    }) as WaGroupChat | undefined;
    return found ?? null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

/**
 * Fallback leave via WA Web page modules — used when GroupChat.leave() throws
 * (module rename / evaluate flake).
 */
async function leaveViaPageEvaluate(
  client: InstanceType<typeof Client>,
  chatId: string,
): Promise<void> {
  const page = client.pupPage;
  if (!page) {
    throw new Error('WA_PAGE_UNAVAILABLE');
  }

  await page.evaluate(async (id: string) => {
    const w = window as unknown as {
      WWebJS?: {
        getChat?: (
          chatId: string,
          opts?: { getAsModel?: boolean },
        ) => Promise<unknown>;
      };
      require?: (name: string) => { sendExitGroup?: (chat: unknown) => Promise<unknown> };
      Store?: {
        GroupUtils?: { sendExitGroup?: (chat: unknown) => Promise<unknown> };
        Cmd?: { exitChat?: (chat: unknown) => Promise<unknown> };
      };
    };

    const chat = await w.WWebJS?.getChat?.(id, { getAsModel: false });
    if (!chat) {
      throw new Error('chat not found');
    }

    try {
      const mod = w.require?.('WAWebExitGroupAction');
      if (typeof mod?.sendExitGroup === 'function') {
        await mod.sendExitGroup(chat);
        return;
      }
    } catch {
      /* try Store fallbacks */
    }

    if (typeof w.Store?.GroupUtils?.sendExitGroup === 'function') {
      await w.Store.GroupUtils.sendExitGroup(chat);
      return;
    }
    if (typeof w.Store?.Cmd?.exitChat === 'function') {
      await w.Store.Cmd.exitChat(chat);
      return;
    }

    throw new Error('No exit group action available in WA Web');
  }, chatId);
}

async function performLeave(
  client: InstanceType<typeof Client>,
  chat: WaGroupChat,
  chatId: string,
): Promise<void> {
  const tryChatLeave = async () => {
    if (typeof chat.leave !== 'function') {
      throw new Error('chat.leave is not a function');
    }
    await withPromiseTimeout(chat.leave(), WA_LEAVE_STEP_TIMEOUT_MS, 'leave');
  };

  try {
    await withDetachedFrameRetry('leave', tryChatLeave);
    return;
  } catch (error) {
    if (isNotFoundError(error)) throw error;
    console.warn(
      '[wa-leave] chat.leave failed, trying page evaluate fallback:',
      errorMessage(error),
    );
  }

  await withDetachedFrameRetry('leaveViaPage', () =>
    withPromiseTimeout(leaveViaPageEvaluate(client, chatId), WA_LEAVE_STEP_TIMEOUT_MS, 'leaveViaPage'),
  );
}

type LeaveOutcome = 'left' | 'not_found' | 'error';

export async function leaveOneGroup(
  client: InstanceType<typeof Client>,
  groupId: string,
): Promise<{ outcome: LeaveOutcome; message?: string }> {
  const chatId = normalizeGroupChatId(groupId);
  try {
    const chat = await resolveGroupChat(client, chatId);
    if (!chat) {
      return { outcome: 'not_found', message: 'chat not found' };
    }
    await performLeave(client, chat, chatId);
    return { outcome: 'left' };
  } catch (error) {
    const message = errorMessage(error);
    console.warn('[wa-leave] leaveOneGroup failed', chatId, message);
    if (isNotFoundError(error)) {
      return { outcome: 'not_found', message };
    }
    return { outcome: 'error', message };
  }
}

export async function runWaLeaveGroup(
  payload: AutomationRunPayload,
  onProgress?: AutomationProgressCallback,
): Promise<AutomationRunResult> {
  const groups = resolveLeaveDeleteGroups(payload);
  if (groups.length === 0) {
    return {
      status: 'error',
      action: 'leave_group',
      message: 'groupId required in groups[] or payload',
      errorCode: 'INVALID_PAYLOAD',
    };
  }

  const betweenSec = payload.delay?.between_groups_sec ?? 60;
  const jitterPercent = payload.delay?.jitter_percent ?? 35;

  return withWhatsAppClient(
    payload.sessionId,
    async (client) => {
      let left = 0;
      let notFound = 0;
      const failed: string[] = [];
      const groupOutcomes: Array<{
        groupId: string;
        groupName?: string;
        inviteLink?: string;
        groupLink?: string;
        exitStatus: 'left' | 'failed';
        exitError?: string;
      }> = [];

      for (let i = 0; i < groups.length; i += 1) {
        const group = groups[i];
        onProgress?.(i, groups.length, group.groupName ?? group.groupId);
        const result = await leaveOneGroup(client, group.groupId);
        if (result.outcome === 'left') {
          left += 1;
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            groupLink: group.groupLink,
            exitStatus: 'left',
          });
          onProgress?.(i + 1, groups.length, group.groupName ?? 'Left');
        } else if (result.outcome === 'not_found') {
          notFound += 1;
          const exitError = result.message ?? 'Not Found';
          failed.push(`${group.groupName ?? group.groupId}: Not Found`);
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            groupLink: group.groupLink,
            exitStatus: 'failed',
            exitError,
          });
          onProgress?.(i + 1, groups.length, group.groupName ?? 'Not Found');
        } else {
          const exitError = result.message ?? 'error';
          failed.push(`${group.groupName ?? group.groupId}: ${exitError}`);
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            groupLink: group.groupLink,
            exitStatus: 'failed',
            exitError,
          });
          onProgress?.(i + 1, groups.length, group.groupName ?? 'Exit failed');
        }

        if (i < groups.length - 1) {
          await sleep(jitterMs(betweenSec * 1000, jitterPercent));
        }
      }

      const success = left;
      const total = groups.length;
      const baseMessage = `Left ${left}/${total}${notFound > 0 ? `, Not Found ${notFound}` : ''}`;
      const detailSuffix =
        failed.length > 0
          ? ` — ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? ` (+${failed.length - 3} more)` : ''}`
          : '';
      return {
        status: success > 0 ? 'ok' : 'error',
        action: 'leave_group',
        message: `${baseMessage}${detailSuffix}`,
        errorCode: success > 0 ? undefined : 'LEAVE_GROUP_FAILED',
        result: { success, total, left, notFound, failed, groupOutcomes },
      };
    },
    { purpose: 'operation' },
  );
}
