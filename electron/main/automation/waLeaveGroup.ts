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

type LeaveOutcome = 'left' | 'not_found' | 'error';

export async function leaveOneGroup(
  client: InstanceType<typeof Client>,
  groupId: string,
): Promise<{ outcome: LeaveOutcome; message?: string }> {
  const chatId = normalizeGroupChatId(groupId);
  try {
    const chat = await withPromiseTimeout(
      client.getChatById(chatId),
      WA_LEAVE_STEP_TIMEOUT_MS,
      'getChatById',
    );
    if (!chat) {
      return { outcome: 'not_found', message: 'chat not found' };
    }
    if (!chat.isGroup) {
      return { outcome: 'not_found', message: 'not a group' };
    }
    await withPromiseTimeout(chat.leave(), WA_LEAVE_STEP_TIMEOUT_MS, 'leave');
    return { outcome: 'left' };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        outcome: 'not_found',
        message: error instanceof Error ? error.message : String(error),
      };
    }
    return {
      outcome: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
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
          failed.push(`${group.groupName ?? group.groupId}: Not Found`);
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            groupLink: group.groupLink,
            exitStatus: 'failed',
          });
        } else {
          failed.push(`${group.groupName ?? group.groupId}: ${result.message ?? 'error'}`);
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            groupLink: group.groupLink,
            exitStatus: 'failed',
          });
        }

        if (i < groups.length - 1) {
          await sleep(jitterMs(betweenSec * 1000, jitterPercent));
        }
      }

      const success = left;
      const total = groups.length;
      return {
        status: success > 0 ? 'ok' : 'error',
        action: 'leave_group',
        message: `Left ${left}/${total}${notFound > 0 ? `, Not Found ${notFound}` : ''}`,
        errorCode: success > 0 ? undefined : 'LEAVE_GROUP_FAILED',
        result: { success, total, left, notFound, failed, groupOutcomes },
      };
    },
    { purpose: 'operation' },
  );
}
