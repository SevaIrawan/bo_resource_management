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

const WA_WIPE_TIMEOUT_MS = 45_000;

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

function isNotFoundError(error: unknown): boolean {
  const msg = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('invalid wid') ||
    msg.includes('wid error') ||
    msg.includes('no chat')
  );
}

type WipeOutcome = 'deleted' | 'not_found' | 'error';

export async function wipeGroupChat(
  client: InstanceType<typeof Client>,
  groupId: string,
  clearHistory: boolean,
): Promise<WipeOutcome> {
  const chatId = normalizeGroupChatId(groupId);
  let chat: Awaited<ReturnType<InstanceType<typeof Client>['getChatById']>> | null = null;

  try {
    chat = await withPromiseTimeout(
      client.getChatById(chatId),
      WA_WIPE_TIMEOUT_MS,
      'getChatById',
    );
  } catch (error) {
    if (isNotFoundError(error)) return 'not_found';
    throw error;
  }

  if (!chat) return 'not_found';

  try {
    await withPromiseTimeout(
      chat.fetchMessages({ limit: 1 }),
      15_000,
      'fetchMessages',
    );
  } catch {
    // sync ringan — optional
  }

  if (chat.archived) {
    try {
      await withPromiseTimeout(chat.unarchive(), 15_000, 'unarchive');
    } catch {
      // ignore
    }
  }

  if (clearHistory) {
    try {
      await withPromiseTimeout(chat.clearMessages(), 22_000, 'clearMessages');
    } catch {
      // continue to delete
    }
    await sleep(900);
  }

  try {
    await withPromiseTimeout(chat.delete(), 22_000, 'delete');
    return 'deleted';
  } catch {
    return 'error';
  }
}

export async function runWaDeleteGroupChat(
  payload: AutomationRunPayload,
  onProgress?: AutomationProgressCallback,
): Promise<AutomationRunResult> {
  const groups = resolveLeaveDeleteGroups(payload);
  if (groups.length === 0) {
    return {
      status: 'error',
      action: 'delete_group',
      message: 'groupId required in groups[] or payload',
      errorCode: 'INVALID_PAYLOAD',
    };
  }

  const clearHistory = payload.leaveDelete?.clearChatHistoryOnDelete === true;
  const betweenSec = payload.delay?.between_groups_sec ?? 60;
  const jitterPercent = payload.delay?.jitter_percent ?? 35;

  return withWhatsAppClient(
    payload.sessionId,
    async (client) => {
      let deleted = 0;
      let notFound = 0;
      const failed: string[] = [];

      for (let i = 0; i < groups.length; i += 1) {
        const group = groups[i];
        onProgress?.(i, groups.length, group.groupName ?? group.groupId);
        try {
          const outcome = await withPromiseTimeout(
            wipeGroupChat(client, group.groupId, clearHistory),
            WA_WIPE_TIMEOUT_MS + 20_000,
            'wipeGroupChat',
          );
          if (outcome === 'deleted') {
            deleted += 1;
            onProgress?.(i + 1, groups.length, group.groupName ?? 'Deleted');
          } else if (outcome === 'not_found') {
            notFound += 1;
            failed.push(`${group.groupName ?? group.groupId}: Not Found`);
          } else {
            failed.push(`${group.groupName ?? group.groupId}: delete failed`);
          }
        } catch (error) {
          failed.push(
            `${group.groupName ?? group.groupId}: ${error instanceof Error ? error.message : 'error'}`,
          );
        }

        if (i < groups.length - 1) {
          await sleep(jitterMs(betweenSec * 1000, jitterPercent));
        }
      }

      const success = deleted;
      const total = groups.length;
      return {
        status: success > 0 ? 'ok' : 'error',
        action: 'delete_group',
        message: `Deleted ${deleted}/${total}${notFound > 0 ? `, Not Found ${notFound}` : ''}`,
        errorCode: success > 0 ? undefined : 'DELETE_GROUP_FAILED',
        result: { success, total, deleted, notFound, failed },
      };
    },
    { purpose: 'operation' },
  );
}
