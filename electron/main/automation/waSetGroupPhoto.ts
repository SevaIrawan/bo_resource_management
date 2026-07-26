import fs from 'node:fs';
import pkg from 'whatsapp-web.js';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import { waitForWhatsAppStoreReady } from '../scraper/whatsappGroupDiscovery';
import { resolveBrandPhotoWithFallback } from '../brandGroupPhoto';
import { withPromiseTimeout } from './promiseTimeout';
import { resolveSetAdminGroups } from './jobQueueBatchHelpers';
import type {
  AutomationProgressCallback,
  AutomationRunPayload,
  AutomationRunResult,
} from './types';

const { Client, MessageMedia } = pkg;

const WA_SET_PICTURE_TIMEOUT_MS = 120_000;
const WA_SET_PHOTO_MAX_ATTEMPTS = 3;
const WA_SET_PHOTO_RETRY_MS = 1_500;

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
  const raw = String(error ?? '').trim();
  return raw || 'unknown error';
}

/** WA Web evaluate flake — Error("r") saat serialize chat ke Node. */
function isCrypticWaEvaluateError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error);
  const msg = raw.trim();
  if (!msg || msg.length <= 3) return true;
  if (/^r(:\s*r)?$/i.test(msg)) return true;
  const name = error instanceof Error ? error.name.trim() : '';
  return Boolean(name && name.length <= 3 && /^[a-z]$/i.test(name));
}

function isNotFoundError(error: unknown): boolean {
  const msg = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('invalid wid') ||
    msg.includes('wid error') ||
    msg.includes('no chat') ||
    msg.includes('group_not_found')
  );
}

type SetPhotoOutcome = 'set' | 'not_found' | 'denied' | 'error';

/**
 * Set foto grup lewat WWebJS.setPicture di page — sama path GroupChat.setPicture,
 * tanpa tarik objek chat ke Node (hindari Error "r" serialize → 0 foto di device).
 */
async function setPhotoViaPageEvaluate(
  client: InstanceType<typeof Client>,
  chatId: string,
  media: { mimetype: string; data: string; filename?: string },
): Promise<SetPhotoOutcome> {
  const page = client.pupPage;
  if (!page) throw new Error('WA_PAGE_UNAVAILABLE');

  const result = await withPromiseTimeout(
    page.evaluate(
      async (gid: string, mediaPayload: { mimetype: string; data: string; filename?: string }) => {
        const w = window as unknown as {
          WWebJS?: {
            setPicture?: (
              chatId: string,
              media: { mimetype: string; data: string; filename?: string },
            ) => Promise<boolean>;
            getChat?: (
              id: string,
              opts?: { getAsModel?: boolean },
            ) => Promise<{ groupMetadata?: unknown; isGroup?: boolean } | null>;
          };
          require?: (name: string) => {
            queryAndUpdateGroupMetadataById?: (input: { id: string }) => Promise<unknown> | unknown;
          };
        };

        try {
          const job = w.require?.('WAWebGroupQueryJob');
          const q = job?.queryAndUpdateGroupMetadataById?.({ id: gid });
          if (q && typeof (q as Promise<unknown>).then === 'function') await q;
        } catch {
          /* optional refresh */
        }

        // Pastikan peer grup ada di store (tanpa serialize ke Node).
        try {
          const chat = await w.WWebJS?.getChat?.(gid, { getAsModel: false });
          if (!chat) return { ok: false as const, reason: 'not_found' as const };
          if (!chat.groupMetadata && !chat.isGroup) {
            return { ok: false as const, reason: 'not_found' as const };
          }
        } catch {
          /* lanjut setPicture — createWid + ProfilePicThumb bisa tetap jalan */
        }

        if (typeof w.WWebJS?.setPicture !== 'function') {
          return { ok: false as const, reason: 'unavailable' as const };
        }

        const ok = await w.WWebJS.setPicture(gid, mediaPayload);
        if (!ok) return { ok: false as const, reason: 'denied' as const };
        return { ok: true as const };
      },
      chatId,
      {
        mimetype: media.mimetype,
        data: media.data,
        filename: media.filename,
      },
    ),
    WA_SET_PICTURE_TIMEOUT_MS,
    'setPicture',
  );

  if (result.ok) return 'set';
  if (result.reason === 'not_found') return 'not_found';
  if (result.reason === 'denied') return 'denied';
  throw new Error('SET_PICTURE_UNAVAILABLE');
}

async function setPhotoOnGroup(
  client: InstanceType<typeof Client>,
  groupId: string,
  photoPath: string,
): Promise<SetPhotoOutcome> {
  const chatId = normalizeGroupChatId(groupId);
  const media = MessageMedia.fromFilePath(photoPath);

  let lastError: unknown;
  for (let attempt = 0; attempt < WA_SET_PHOTO_MAX_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 0) {
        await waitForWhatsAppStoreReady(client, 30_000);
        await sleep(WA_SET_PHOTO_RETRY_MS * attempt);
      }
      const outcome = await setPhotoViaPageEvaluate(client, chatId, media);
      if (outcome === 'set' || outcome === 'not_found' || outcome === 'denied') {
        return outcome;
      }
    } catch (error) {
      lastError = error;
      if (isNotFoundError(error)) return 'not_found';
      if (!isCrypticWaEvaluateError(error) && !/TIMEOUT|detached/i.test(errorMessage(error))) {
        throw error;
      }
      console.warn(
        `[wa-set-photo] setPicture flake attempt ${attempt + 1}/${WA_SET_PHOTO_MAX_ATTEMPTS} (${chatId}):`,
        isCrypticWaEvaluateError(error) ? 'cryptic evaluate error' : errorMessage(error),
      );
    }
  }

  if (lastError) throw lastError instanceof Error ? lastError : new Error(errorMessage(lastError));
  return 'error';
}

export async function runWaSetGroupPhoto(
  payload: AutomationRunPayload,
  onProgress?: AutomationProgressCallback,
): Promise<AutomationRunResult> {
  let photoPath = payload.photoPath?.trim() ?? '';

  if (!photoPath || !fs.existsSync(photoPath)) {
    const brandName = payload.brandName?.trim();
    if (brandName) {
      const resolved = await resolveBrandPhotoWithFallback(brandName, payload.userId);
      if (resolved) photoPath = resolved;
    }
  }

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
        photoError?: string;
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
            const reason =
              outcome === 'not_found'
                ? 'Not Found'
                : outcome === 'denied'
                  ? 'Permission denied (canSet=false)'
                  : 'setPicture failed';
            failed.push(`${group.groupName ?? group.groupId}: ${reason}`);
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              photoStatus: 'failed',
              photoError: reason,
            });
          }
        } catch (error) {
          const message = isCrypticWaEvaluateError(error)
            ? 'WhatsApp store flake during setPicture — retry'
            : errorMessage(error);
          failed.push(`${group.groupName ?? group.groupId}: ${message}`);
          groupOutcomes.push({
            groupId: group.groupId,
            groupName: group.groupName,
            photoStatus: 'failed',
            photoError: message,
          });
        }
      }

      return {
        status: success >= groups.length ? 'ok' : 'error',
        action: 'set_group_photo',
        message: `Set photo ${success}/${groups.length} group(s)`,
        errorCode:
          success >= groups.length
            ? undefined
            : success > 0
              ? 'SET_GROUP_PHOTO_PARTIAL'
              : 'SET_GROUP_PHOTO_FAILED',
        result: { success, total: groups.length, failed, groupOutcomes },
      };
    },
    { purpose: 'operation' },
  );
}
