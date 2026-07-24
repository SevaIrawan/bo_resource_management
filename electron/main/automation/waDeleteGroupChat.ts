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
const WA_DELETE_MAX_ATTEMPTS = 3;
const WA_DELETE_RETRY_MS = 1_200;

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
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return String(error ?? '').trim() || 'unknown error';
}

function isCrypticWaEvaluateError(error: unknown): boolean {
  const raw = errorMessage(error);
  if (!raw || raw.length <= 3) return true;
  if (/^r(:\s*r)?$/i.test(raw)) return true;
  const name = error instanceof Error ? error.name.trim() : '';
  return Boolean(name && name.length <= 3 && /^[a-z]$/i.test(name));
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

type WipeOutcome = 'deleted' | 'not_found' | 'error';

/**
 * Wipe chat lokal lewat WWebJS.sendClearChat / sendDeleteChat di page —
 * sama path Chat.clearMessages / Chat.delete, tanpa serialize chat ke Node.
 */
async function wipeViaPageEvaluate(
  client: InstanceType<typeof Client>,
  chatId: string,
  clearHistory: boolean,
): Promise<WipeOutcome> {
  const page = client.pupPage;
  if (!page) throw new Error('WA_PAGE_UNAVAILABLE');

  const result = await withPromiseTimeout(
    page.evaluate(
      async (gid: string, clear: boolean) => {
        const w = window as unknown as {
          WWebJS?: {
            getChat?: (
              id: string,
              opts?: { getAsModel?: boolean },
            ) => Promise<unknown | null | undefined>;
            sendClearChat?: (id: string) => Promise<boolean>;
            sendDeleteChat?: (id: string) => Promise<boolean>;
          };
        };

        const chat = await w.WWebJS?.getChat?.(gid, { getAsModel: false });
        if (chat == null) {
          return { ok: false as const, reason: 'not_found' as const };
        }

        if (clear && typeof w.WWebJS?.sendClearChat === 'function') {
          try {
            await w.WWebJS.sendClearChat(gid);
          } catch {
            /* lanjut delete */
          }
        }

        if (typeof w.WWebJS?.sendDeleteChat !== 'function') {
          return { ok: false as const, reason: 'unavailable' as const };
        }

        const deleted = await w.WWebJS.sendDeleteChat(gid);
        if (!deleted) return { ok: false as const, reason: 'delete_failed' as const };
        return { ok: true as const };
      },
      chatId,
      clearHistory,
    ),
    WA_WIPE_TIMEOUT_MS,
    'wipeViaPage',
  );

  if (result.ok) return 'deleted';
  if (result.reason === 'not_found') return 'not_found';
  return 'error';
}

export async function wipeGroupChat(
  client: InstanceType<typeof Client>,
  groupId: string,
  clearHistory: boolean,
): Promise<WipeOutcome> {
  const chatId = normalizeGroupChatId(groupId);
  let lastError: unknown;

  for (let attempt = 0; attempt < WA_DELETE_MAX_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 0) {
        await sleep(WA_DELETE_RETRY_MS * attempt);
      }
      return await wipeViaPageEvaluate(client, chatId, clearHistory);
    } catch (error) {
      lastError = error;
      if (isNotFoundError(error)) return 'not_found';
      if (!isCrypticWaEvaluateError(error) && !/TIMEOUT|detached/i.test(errorMessage(error))) {
        throw error;
      }
      console.warn(
        `[wa-delete] wipe flake attempt ${attempt + 1}/${WA_DELETE_MAX_ATTEMPTS} (${chatId}):`,
        isCrypticWaEvaluateError(error) ? 'cryptic evaluate error' : errorMessage(error),
      );
    }
  }

  if (lastError) throw lastError instanceof Error ? lastError : new Error(errorMessage(lastError));
  return 'error';
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
      const groupOutcomes: Array<{
        groupId: string;
        groupName?: string;
        deleteStatus: 'deleted' | 'failed';
      }> = [];

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
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              deleteStatus: 'deleted',
            });
            onProgress?.(i + 1, groups.length, group.groupName ?? 'Deleted');
          } else if (outcome === 'not_found') {
            notFound += 1;
            failed.push(`${group.groupName ?? group.groupId}: Not Found`);
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              deleteStatus: 'failed',
            });
          } else {
            failed.push(`${group.groupName ?? group.groupId}: delete failed`);
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              deleteStatus: 'failed',
            });
          }
        } catch (error) {
          const msg = isCrypticWaEvaluateError(error)
            ? 'WhatsApp store flake during delete — retry'
            : errorMessage(error);
          failed.push(`${group.groupName ?? group.groupId}: ${msg}`);
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            deleteStatus: 'failed',
          });
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
        result: { success, total, deleted, notFound, failed, groupOutcomes },
      };
    },
    { purpose: 'operation' },
  );
}
