import fs from 'node:fs';
import pkg from 'whatsapp-web.js';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import { waitForWhatsAppStoreReady } from '../scraper/whatsappGroupDiscovery';
import { withPromiseTimeout } from './promiseTimeout';
import { resolveSetAdminGroups } from './jobQueueBatchHelpers';
import type {
  AutomationProgressCallback,
  AutomationRunPayload,
  AutomationRunResult,
} from './types';

const { Client, MessageMedia } = pkg;

const WA_SET_PICTURE_TIMEOUT_MS = 120_000;
const WA_CHAT_LOOKUP_TIMEOUT_MS = 90_000;

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

async function setPhotoOnGroup(
  client: InstanceType<typeof Client>,
  groupId: string,
  photoPath: string,
): Promise<'set' | 'not_found' | 'error'> {
  const chatId = normalizeGroupChatId(groupId);
  let chat: Awaited<ReturnType<InstanceType<typeof Client>['getChatById']>> | null = null;

  try {
    chat = await withPromiseTimeout(
      client.getChatById(chatId),
      WA_CHAT_LOOKUP_TIMEOUT_MS,
      'getChatById',
    );
  } catch (error) {
    if (isNotFoundError(error)) return 'not_found';
    throw error;
  }

  if (!chat?.isGroup) return 'not_found';

  const media = MessageMedia.fromFilePath(photoPath);
  await withPromiseTimeout(chat.setPicture(media), WA_SET_PICTURE_TIMEOUT_MS, 'setPicture');
  return 'set';
}

export async function runWaSetGroupPhoto(
  payload: AutomationRunPayload,
  onProgress?: AutomationProgressCallback,
): Promise<AutomationRunResult> {
  const photoPath = payload.photoPath?.trim();
  if (!photoPath) {
    return {
      status: 'error',
      action: 'set_group_photo',
      message: 'photoPath required',
      errorCode: 'INVALID_PAYLOAD',
    };
  }
  if (!fs.existsSync(photoPath)) {
    return {
      status: 'error',
      action: 'set_group_photo',
      message: `Photo file not found: ${photoPath}`,
      errorCode: 'PHOTO_NOT_FOUND',
    };
  }

  const groups = resolveSetAdminGroups(payload);
  if (groups.length === 0) {
    return {
      status: 'error',
      action: 'set_group_photo',
      message: 'groups required',
      errorCode: 'INVALID_PAYLOAD',
    };
  }

  return withWhatsAppClient(
    payload.sessionId,
    async (client) => {
      await waitForWhatsAppStoreReady(client);

      let success = 0;
      const failed: string[] = [];
      const groupOutcomes: Array<{
        groupId: string;
        groupName?: string;
        photoStatus: 'set' | 'failed';
      }> = [];

      for (let i = 0; i < groups.length; i += 1) {
        const group = groups[i];
        onProgress?.(i, groups.length, group.groupName ?? group.groupId);

        if (i > 0) {
          const betweenSec = payload.delay?.between_groups_sec ?? 120;
          await sleep(jitterMs(betweenSec * 1000, payload.delay?.jitter_percent));
        }

        try {
          const outcome = await setPhotoOnGroup(client, group.groupId, photoPath);
          if (outcome === 'set') {
            success += 1;
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              photoStatus: 'set',
            });
            onProgress?.(i + 1, groups.length, group.groupName ?? 'Photo set');
          } else {
            failed.push(`${group.groupName ?? group.groupId}: Not Found`);
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              photoStatus: 'failed',
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'setPicture failed';
          failed.push(`${group.groupName ?? group.groupId}: ${message}`);
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            photoStatus: 'failed',
          });
        }
      }

      return {
        status: success > 0 ? 'ok' : 'error',
        action: 'set_group_photo',
        message: `Set photo ${success}/${groups.length} group(s)`,
        errorCode: success > 0 ? undefined : 'SET_GROUP_PHOTO_FAILED',
        result: { success, total: groups.length, failed, groupOutcomes },
      };
    },
    { purpose: 'operation' },
  );
}
