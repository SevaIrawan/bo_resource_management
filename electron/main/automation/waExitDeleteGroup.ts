import pkg from 'whatsapp-web.js';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import { withPromiseTimeout } from './promiseTimeout';
import { resolveLeaveDeleteGroups } from './jobQueueBatchHelpers';
import { leaveOneGroup } from './waLeaveGroup';
import { wipeGroupChat } from './waDeleteGroupChat';
import type {
  AutomationProgressCallback,
  AutomationRunPayload,
  AutomationRunResult,
} from './types';

const { Client } = pkg;

const WA_WIPE_TIMEOUT_MS = 45_000;
const WA_STEP_GAP_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs(baseMs: number, jitterPercent = 35): number {
  const jitter = jitterPercent / 100;
  const low = baseMs * (1 - jitter);
  const high = baseMs * (1 + jitter);
  return Math.max(100, Math.floor(low + Math.random() * (high - low)));
}

/** Satu job: leave grup → delete hanya jika leave sukses. */
export async function runWaExitDeleteGroup(
  payload: AutomationRunPayload,
  onProgress?: AutomationProgressCallback,
): Promise<AutomationRunResult> {
  const groups = resolveLeaveDeleteGroups(payload);
  if (groups.length === 0) {
    return {
      status: 'error',
      action: 'exit_delete_group',
      message: 'groupId required in groups[] or payload',
      errorCode: 'INVALID_PAYLOAD',
    };
  }

  const clearHistory = payload.leaveDelete?.clearChatHistoryOnDelete === true;
  const betweenSec = payload.delay?.between_groups_sec ?? 60;
  const jitterPercent = payload.delay?.jitter_percent ?? 35;

  return withWhatsAppClient(
    payload.sessionId,
    async (client: InstanceType<typeof Client>) => {
      let left = 0;
      let deleted = 0;
      let exited = 0;
      const failed: string[] = [];
      const groupOutcomes: Array<{
        groupId: string;
        groupName?: string;
        exitStatus: 'left' | 'failed';
        exitError?: string;
        deleteStatus: 'deleted' | 'failed' | 'skipped';
      }> = [];

      for (let i = 0; i < groups.length; i += 1) {
        const group = groups[i];
        const label = group.groupName ?? group.groupId;
        onProgress?.(exited, groups.length, `Leave: ${label}`);

        const leaveResult = await leaveOneGroup(client, group.groupId);
        if (leaveResult.outcome === 'left') {
          left += 1;
        } else if (leaveResult.outcome === 'not_found') {
          failed.push(`${label}: leave not found`);
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            exitStatus: 'failed',
            exitError: 'not found',
            deleteStatus: 'skipped',
          });
          if (i < groups.length - 1) {
            await sleep(jitterMs(betweenSec * 1000, jitterPercent));
          }
          continue;
        } else {
          const exitError = leaveResult.message ?? 'failed';
          failed.push(`${label}: leave ${exitError}`);
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            exitStatus: 'failed',
            exitError,
            deleteStatus: 'skipped',
          });
          if (i < groups.length - 1) {
            await sleep(jitterMs(betweenSec * 1000, jitterPercent));
          }
          continue;
        }

        await sleep(WA_STEP_GAP_MS);
        onProgress?.(exited, groups.length, `Delete: ${label}`);

        try {
          const wipeOutcome = await withPromiseTimeout(
            wipeGroupChat(client, group.groupId, clearHistory),
            WA_WIPE_TIMEOUT_MS + 20_000,
            'wipeGroupChat',
          );
          if (wipeOutcome === 'deleted') {
            deleted += 1;
            exited += 1;
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              exitStatus: 'left',
              deleteStatus: 'deleted',
            });
            onProgress?.(exited, groups.length, `Exited: ${label}`);
          } else if (wipeOutcome === 'not_found') {
            failed.push(`${label}: left OK, delete not found`);
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              exitStatus: 'left',
              deleteStatus: 'failed',
            });
          } else {
            failed.push(`${label}: left OK, delete failed`);
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              exitStatus: 'left',
              deleteStatus: 'failed',
            });
          }
        } catch (error) {
          failed.push(
            `${label}: left OK, delete ${error instanceof Error ? error.message : 'error'}`,
          );
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            exitStatus: 'left',
            deleteStatus: 'failed',
          });
        }

        if (i < groups.length - 1) {
          await sleep(jitterMs(betweenSec * 1000, jitterPercent));
        }
      }

      const total = groups.length;
      return {
        status: exited > 0 ? 'ok' : 'error',
        action: 'exit_delete_group',
        message: `Exited ${exited}/${total} (left ${left}, deleted ${deleted})`,
        errorCode: exited > 0 ? undefined : 'EXIT_DELETE_GROUP_FAILED',
        result: { success: exited, total, left, deleted, failed, groupOutcomes },
      };
    },
  );
}
