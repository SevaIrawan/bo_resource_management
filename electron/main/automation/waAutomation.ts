import pkg from 'whatsapp-web.js';
import { withWhatsAppClient } from '../platformLogin/whatsapp';
import { fetchWhatsAppGroupInviteLink } from '../scraper/whatsappGroupInviteLink';
import { waitForWhatsAppStoreReady } from '../scraper/whatsappGroupDiscovery';
import { withPromiseTimeout } from './promiseTimeout';
import { resolveJoinGroups, resolveSetAdminGroups } from './jobQueueBatchHelpers';
import { attachJobGroupOutcomes, peekJobStopRequest } from './jobQueueStore';
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
import {
  createGroupBatchUsesNumbering,
  resolveCreateBatchGroupName,
} from './createGroupBatchNaming';

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

/** WA Web kadang throw Error("r") / name "r" dari evaluate — bukan pesan berguna. */
function isCrypticWaEvaluateError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error);
  const msg = raw.trim();
  if (!msg || msg.length <= 3) return true;
  if (/^r(:\s*r)?$/i.test(msg)) return true;
  const name = error instanceof Error ? error.name.trim() : '';
  return Boolean(name && name.length <= 3 && /^[a-z]$/i.test(name));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const raw = String(error ?? '').trim();
  return raw || 'unknown error';
}

/**
 * getChatById sering flake (Error "r") saat serialize chat ke Node.
 * Jangan andalkan getChats (serialize semua chat — sama flake).
 * Probe ringan lewat page.evaluate → hanya scalar (id/name/isGroup).
 */
async function probeGroupViaPage(
  client: InstanceType<typeof Client>,
  chatIdRaw: string,
): Promise<{ id: string; name?: string; isGroup: boolean } | null> {
  const chatId = normalizeGroupChatId(chatIdRaw);
  const page = client.pupPage;
  if (!chatId || !page) return null;

  try {
    return await withDetachedFrameRetry('probeGroupViaPage', () =>
      withPromiseTimeout(
        page.evaluate(async (gid: string) => {
          const w = window as unknown as {
            WWebJS?: {
              getChat?: (
                id: string,
                opts?: { getAsModel?: boolean },
              ) => Promise<{
                name?: string;
                groupMetadata?: unknown;
                isGroup?: boolean;
              } | null>;
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
            /* optional metadata refresh */
          }

          const chat = await w.WWebJS?.getChat?.(gid, { getAsModel: false });
          if (!chat) return null;
          return {
            id: gid,
            name: typeof chat.name === 'string' ? chat.name : undefined,
            isGroup: Boolean(chat.groupMetadata) || Boolean(chat.isGroup),
          };
        }, chatId),
        WA_CHAT_LOOKUP_TIMEOUT_MS,
        'probeGroupViaPage',
      ),
    );
  } catch (error) {
    console.warn(
      `[wa-automation] probeGroupViaPage failed (${chatId}):`,
      isCrypticWaEvaluateError(error) ? 'cryptic evaluate error' : errorMessage(error),
    );
    return null;
  }
}

/**
 * Promote admin langsung di page (sama path wwebjs GroupChat.promoteParticipants).
 * Return terstruktur — jangan throw dari evaluate (Puppeteer sering jadi Error "r").
 */
async function promoteViaPageEvaluate(
  client: InstanceType<typeof Client>,
  chatIdRaw: string,
  participantIds: string[],
): Promise<{ promoted: string[]; missing: string[] }> {
  const chatId = normalizeGroupChatId(chatIdRaw);
  const page = client.pupPage;
  if (!page) throw new Error('WA_PAGE_UNAVAILABLE');
  if (!chatId) throw new Error('GROUP_ID_REQUIRED');

  const result = await withDetachedFrameRetry('promoteViaPage', () =>
    withPromiseTimeout(
      page.evaluate(
        async (gid: string, ids: string[]) => {
          type PromotePageResult =
            | { ok: true; promoted: string[]; missing: string[] }
            | { ok: false; reason: string };

          try {
            const w = window as unknown as {
              WWebJS?: {
                getChat?: (
                  id: string,
                  opts?: { getAsModel?: boolean },
                ) => Promise<{
                  groupMetadata?: {
                    participants?: { get?: (id: string) => unknown };
                  };
                } | null>;
                enforceLidAndPnRetrieval?: (p: string) => Promise<{
                  lid?: { _serialized?: string };
                  phone?: { _serialized?: string };
                }>;
              };
              require?: (name: string) => {
                queryAndUpdateGroupMetadataById?: (input: { id: string }) => Promise<unknown> | unknown;
                promoteParticipants?: (chat: unknown, parts: unknown[]) => Promise<unknown>;
                createWid?: (id: string) => unknown;
                get?: (wid: unknown) => unknown;
                find?: (wid: unknown) => Promise<unknown>;
                Chat?: { get?: (wid: unknown) => unknown; find?: (wid: unknown) => Promise<unknown> };
              };
            };

            try {
              const job = w.require?.('WAWebGroupQueryJob');
              const q = job?.queryAndUpdateGroupMetadataById?.({ id: gid });
              if (q && typeof (q as Promise<unknown>).then === 'function') await q;
            } catch {
              /* optional */
            }

            let chat: {
              groupMetadata?: { participants?: { get?: (id: string) => unknown } };
            } | null = null;

            try {
              chat = (await w.WWebJS?.getChat?.(gid, { getAsModel: false })) ?? null;
            } catch {
              chat = null;
            }

            if (!chat) {
              try {
                const widFactory = w.require?.('WAWebWidFactory');
                const collections = w.require?.('WAWebCollections');
                const wid = widFactory?.createWid?.(gid);
                chat =
                  ((collections?.Chat?.get?.(wid) as typeof chat) ?? null) ||
                  ((await collections?.Chat?.find?.(wid)) as typeof chat) ||
                  null;
              } catch {
                chat = null;
              }
            }

            if (!chat) return { ok: false, reason: 'GROUP_NOT_FOUND' } satisfies PromotePageResult;
            if (!chat.groupMetadata?.participants) {
              return { ok: false, reason: 'NOT_A_GROUP' } satisfies PromotePageResult;
            }

            const promoted: string[] = [];
            const missing: string[] = [];
            const parts: unknown[] = [];

            for (const p of ids) {
              let lidSerialized = '';
              let phoneSerialized = '';
              try {
                const resolved = await w.WWebJS?.enforceLidAndPnRetrieval?.(p);
                lidSerialized = resolved?.lid?._serialized ?? '';
                phoneSerialized = resolved?.phone?._serialized ?? '';
              } catch {
                phoneSerialized = p.includes('@') ? p : `${p}@c.us`;
              }

              const part =
                (lidSerialized
                  ? chat.groupMetadata.participants.get?.(lidSerialized)
                  : undefined) ||
                (phoneSerialized
                  ? chat.groupMetadata.participants.get?.(phoneSerialized)
                  : undefined) ||
                chat.groupMetadata.participants.get?.(p);

              if (part) {
                parts.push(part);
                promoted.push(p);
              } else {
                missing.push(p);
              }
            }

            if (parts.length === 0) {
              return { ok: false, reason: 'TARGETS_NOT_IN_GROUP' } satisfies PromotePageResult;
            }

            const action = w.require?.('WAWebModifyParticipantsGroupAction');
            if (typeof action?.promoteParticipants !== 'function') {
              return { ok: false, reason: 'PROMOTE_ACTION_UNAVAILABLE' } satisfies PromotePageResult;
            }
            await action.promoteParticipants(chat, parts);
            return { ok: true, promoted, missing } satisfies PromotePageResult;
          } catch (err) {
            const msg =
              err instanceof Error
                ? err.message
                : typeof err === 'string'
                  ? err
                  : 'PROMOTE_FAILED';
            return {
              ok: false,
              reason: msg.trim().length <= 3 ? 'CRYPTIC_EVALUATE' : msg.slice(0, 200),
            } satisfies PromotePageResult;
          }
        },
        chatId,
        participantIds,
      ),
      WA_PROMOTE_TIMEOUT_MS,
      'promoteViaPage',
    ),
  );

  if (result.ok) {
    return { promoted: result.promoted, missing: result.missing };
  }
  throw new Error(result.reason);
}

/**
 * Lookup grup ringan di page (scalar) — tidak pernah serialize chat penuh ke Node.
 */
async function resolveGroupChatOptional(
  client: InstanceType<typeof Client>,
  chatIdRaw: string,
): Promise<{ id: string; name?: string; isGroup?: boolean; chat: unknown } | null> {
  const chatId = normalizeGroupChatId(chatIdRaw);
  if (!chatId) return null;

  const probed = await probeGroupViaPage(client, chatId);
  if (probed) {
    return { id: probed.id, name: probed.name, isGroup: probed.isGroup, chat: null };
  }
  return null;
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

/**
 * Apply permission grup di page — return terstruktur, jangan throw cryptic ("t"/"r").
 * Dipanggil setelah settle singkat pasca-create (store WA sering belum siap).
 */
async function applyCreateGroupSettingsViaPage(
  client: InstanceType<typeof Client>,
  chatIdRaw: string,
  settings?: WaCreateGroupSettings,
): Promise<void> {
  if (!settings) return;
  const chatId = normalizeGroupChatId(chatIdRaw);
  const page = client.pupPage;
  if (!page || !chatId) return;

  try {
    const result = await withPromiseTimeout(
      page.evaluate(
        async (
          gid: string,
          opts: {
            messagesAdminsOnly: boolean;
            addMembersAdminsOnly: boolean;
            infoAdminsOnly: boolean;
          },
        ) => {
          type SettingsResult = { ok: true } | { ok: false; reason: string };
          try {
            const w = window as unknown as {
              WWebJS?: {
                getChat?: (id: string, o?: { getAsModel?: boolean }) => Promise<unknown>;
              };
              require?: (name: string) => {
                setGroupProperty?: (chat: unknown, key: string, value: number) => Promise<unknown>;
                createWid?: (id: string) => unknown;
                Chat?: { get?: (wid: unknown) => unknown; find?: (wid: unknown) => Promise<unknown> };
                queryAndUpdateGroupMetadataById?: (input: { id: string }) => Promise<unknown> | unknown;
              };
            };

            try {
              const job = w.require?.('WAWebGroupQueryJob');
              const q = job?.queryAndUpdateGroupMetadataById?.({ id: gid });
              if (q && typeof (q as Promise<unknown>).then === 'function') await q;
            } catch {
              /* optional */
            }

            let chat: unknown = null;
            try {
              chat = (await w.WWebJS?.getChat?.(gid, { getAsModel: false })) ?? null;
            } catch {
              chat = null;
            }
            if (!chat) {
              try {
                const wid = w.require?.('WAWebWidFactory')?.createWid?.(gid);
                const collections = w.require?.('WAWebCollections');
                chat =
                  collections?.Chat?.get?.(wid) ??
                  (await collections?.Chat?.find?.(wid)) ??
                  null;
              } catch {
                chat = null;
              }
            }
            if (!chat) return { ok: false, reason: 'chat_not_ready' } satisfies SettingsResult;

            const action = w.require?.('WAWebSetPropertyGroupAction');
            if (typeof action?.setGroupProperty !== 'function') {
              return { ok: false, reason: 'setGroupProperty_unavailable' } satisfies SettingsResult;
            }

            const applyOne = async (key: string, value: number) => {
              try {
                await action.setGroupProperty!(chat, key, value);
                return true;
              } catch (err) {
                const name =
                  err && typeof err === 'object' ? String((err as { name?: string }).name) : '';
                if (name === 'ServerStatusCodeError') return false;
                throw err;
              }
            };

            await applyOne('announcement', opts.messagesAdminsOnly ? 1 : 0);
            await applyOne('member_add_mode', opts.addMembersAdminsOnly ? 0 : 1);
            await applyOne('restrict', opts.infoAdminsOnly ? 1 : 0);
            return { ok: true } satisfies SettingsResult;
          } catch (err) {
            const msg =
              err instanceof Error
                ? err.message
                : typeof err === 'string'
                  ? err
                  : 'settings_failed';
            return {
              ok: false,
              reason: msg.trim().length <= 3 ? 'cryptic_evaluate' : msg.slice(0, 120),
            } satisfies SettingsResult;
          }
        },
        chatId,
        {
          messagesAdminsOnly: Boolean(settings.messagesAdminsOnly),
          addMembersAdminsOnly: Boolean(settings.addMembersAdminsOnly),
          infoAdminsOnly: Boolean(settings.infoAdminsOnly),
        },
      ),
      WA_CHAT_LOOKUP_TIMEOUT_MS,
      'applyCreateSettings',
    );

    if (!result.ok && result.reason !== 'chat_not_ready') {
      console.warn(
        `[wa-automation] create settings skipped (${chatId}):`,
        result.reason === 'cryptic_evaluate' ? 'store not ready' : result.reason,
      );
    }
  } catch (err) {
    const msg = errorMessage(err);
    if (!isCrypticWaEvaluateError(err) && msg.length > 3) {
      console.warn('[wa-automation] apply create group settings via page failed:', msg);
    }
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

  const afterCreateSec = payload.delay?.after_create_sec ?? 90;
  const afterCreateMs = jitterMs(afterCreateSec * 1000, payload.delay?.jitter_percent);
  /** Settle dulu sebelum settings + invite — kurangi flake evaluate & tekanan WA API. */
  const settleMs = Math.min(12_000, Math.max(3_000, Math.floor(afterCreateMs * 0.25)));
  const remainderMs = Math.max(0, afterCreateMs - settleMs);
  await sleep(settleMs);

  if (gid && payload.createGroupSettings) {
    await applyCreateGroupSettingsViaPage(client, gid, payload.createGroupSettings);
  }

  if (remainderMs > 0) {
    await sleep(remainderMs);
  }

  const groupId = gid.replace(/@g\.us$/i, '');
  let invite_link: string | null = null;
  if (gid) {
    try {
      invite_link = await fetchWhatsAppGroupInviteLink(client, gid);
    } catch (err) {
      const msg = errorMessage(err);
      if (!isCrypticWaEvaluateError(err) && msg.length > 3) {
        console.warn('[wa-automation] invite link after create failed:', msg);
      }
    }
  }

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

  const chatId = normalizeGroupChatId(groupRef);
  const participantIds = targets.map(toWaParticipantId);
  const maxSlots = Math.max(1, Math.floor(payload.delay?.max_admin_slots ?? 5));
  const limitedIds = participantIds.slice(0, maxSlots);
  const promoted: string[] = [];
  const errors: Array<{ target: string; error: string }> = [];

  /**
   * Path utama: page.evaluate (wwebjs promote) — TIDAK lewat getChatById Node
   * (Error "r" serialize). Retry singkat jika store flake.
   */
  const maxAttempts = 3;
  for (let i = 0; i < limitedIds.length; i += 1) {
    const target = limitedIds[i];
    onProgress?.(i, limitedIds.length, `Promote ${target.replace(/@.*/, '')}`);

    let lastErr = '';
    let ok = false;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        if (attempt > 0) {
          await waitForWhatsAppStoreReady(client, 30_000);
          await sleep(WA_DETACHED_FRAME_RETRY_MS * attempt);
        }
        const result = await promoteViaPageEvaluate(client, chatId, [target]);
        if (result.promoted.includes(target)) {
          promoted.push(target);
          ok = true;
          onProgress?.(i + 1, limitedIds.length, `Promoted ${target.replace(/@.*/, '')}`);
          break;
        }
        lastErr =
          result.missing.includes(target)
            ? 'Target not in group (join first)'
            : 'Promote returned empty';
        break;
      } catch (err) {
        lastErr = errorMessage(err);
        if (lastErr === 'TARGETS_NOT_IN_GROUP') {
          lastErr = 'Target not in group (join first)';
          break;
        }
        if (lastErr === 'GROUP_NOT_FOUND' || lastErr === 'NOT_A_GROUP') {
          break;
        }
        if (!isCrypticWaEvaluateError(err) && !/TIMEOUT|detached/i.test(lastErr)) {
          break;
        }
        console.warn(
          `[wa-automation] promote flake attempt ${attempt + 1}/${maxAttempts} (${chatId}):`,
          isCrypticWaEvaluateError(err) ? 'cryptic evaluate error' : lastErr,
        );
      }
    }

    if (!ok) {
      errors.push({
        target,
        error: isCrypticWaEvaluateError(lastErr)
          ? 'WhatsApp store flake during promote — retry'
          : lastErr || 'Promote failed',
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

function humanizeJoinError(raw: string, link: string): string {
  if (!raw || raw.length <= 3) {
    return `Invite link rejected — link may be expired, revoked, or group is full (${link})`;
  }
  if (/timeout/i.test(raw)) {
    return `Timeout waiting for WhatsApp to accept invite (${link})`;
  }
  if (/revoke|reset|invalid|expire/i.test(raw)) {
    return `Invite link expired or revoked (${link})`;
  }
  if (/full|limit/i.test(raw)) {
    return `Group is full — member limit reached (${link})`;
  }
  if (/ban|block|restrict/i.test(raw)) {
    return `Account banned or restricted from joining this group (${link})`;
  }
  return raw;
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
    const acceptedId = chatId ? String(chatId) : '';
    // acceptInvite sukses = sudah join di device. Lookup nama chat opsional (Error "r").
    let groupName = '';
    if (acceptedId) {
      const resolved = await resolveGroupChatOptional(client, acceptedId);
      groupName = resolved?.name?.trim() || '';
      onProgress?.(1, 1, groupName || 'Joined');
      return {
        status: 'ok',
        action: 'join_by_invite_link',
        result: {
          group_id: acceptedId.replace(/@g\.us$/i, ''),
          group_name: groupName,
          invite_link: link,
          already_member: false,
        },
      };
    }
    if (payload.groupId?.trim()) {
      const resolved = await resolveGroupChatOptional(client, payload.groupId.trim());
      if (resolved?.isGroup) {
        groupName = resolved.name?.trim() || '';
        onProgress?.(1, 1, groupName || 'Joined');
        return {
          status: 'ok',
          action: 'join_by_invite_link',
          result: {
            group_id: resolved.id.replace(/@g\.us$/i, ''),
            group_name: groupName,
            invite_link: link,
            already_member: false,
          },
        };
      }
    }
    return {
      status: 'error',
      action: 'join_by_invite_link',
      message: 'Joined but peer id unresolved',
      errorCode: 'JOIN_PEER_UNRESOLVED',
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/already/i.test(raw)) {
      const expectedId = payload.groupId?.trim();
      if (expectedId) {
        const resolved = await resolveGroupChatOptional(client, expectedId);
        if (resolved?.isGroup) {
          return {
            status: 'ok',
            action: 'join_by_invite_link',
            result: {
              group_id: resolved.id.replace(/@g\.us$/i, ''),
              group_name: resolved.name ?? '',
              invite_link: link,
              already_member: true,
            },
          };
        }
      }
      return {
        status: 'error',
        action: 'join_by_invite_link',
        message: 'Already a member but group id unresolved',
        errorCode: 'JOIN_PEER_UNRESOLVED',
      };
    }
    // Timeout / cryptic evaluate: verifikasi membership lewat groupId payload.
    const expectedId = payload.groupId?.trim();
    if (expectedId) {
      const resolved = await resolveGroupChatOptional(client, expectedId);
      if (resolved?.isGroup) {
        onProgress?.(1, 1, resolved.name?.trim() || 'Joined');
        return {
          status: 'ok',
          action: 'join_by_invite_link',
          result: {
            group_id: resolved.id.replace(/@g\.us$/i, ''),
            group_name: resolved.name ?? '',
            invite_link: link,
            already_member: /already|timeout/i.test(raw) || isCrypticWaEvaluateError(err),
          },
        };
      }
    }
    const msg = humanizeJoinError(raw, link);
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

export async function runWhatsAppCreateGroupBatch(
  payload: AutomationRunPayload,
  onProgress: (current: number, total: number, label: string) => void,
): Promise<AutomationRunResult> {
  const totalRequested = Math.max(1, Math.floor(Number(payload.totalToCreate) || 1));
  const perRun = Math.max(1, Math.floor(Number(payload.perRun) || totalRequested));
  /** Satu execute = max perRun (jangan multi-slice mass create). */
  const totalTarget = Math.min(totalRequested, perRun);
  const startFrom = Math.max(1, Math.floor(Number(payload.startFrom) || 1));
  const useNumbering = createGroupBatchUsesNumbering(payload, totalTarget);
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

      const persistPartial = () => {
        if (!payload.jobId) return;
        attachJobGroupOutcomes(payload.jobId, {
          groupOutcomes: [...groupOutcomes],
          progressCurrent: created,
          message: `${created}/${totalTarget} created`,
        });
      };

      const sliceSize = totalTarget;
      for (let i = 0; i < sliceSize; i += 1) {
        if (isJobStopRequested(payload.jobId)) {
          persistPartial();
          return buildBatchStopResult({ created, totalTarget, failed, groupOutcomes });
        }

        const num = nextNum + i;
        const groupName = resolveCreateBatchGroupName(prefix, num, totalTarget, useNumbering);
        const batchIndex = created + 1;

        onProgress(created, totalTarget, groupName);

        let result: AutomationRunResult;
        try {
          result = await runCreateGroup(client, {
            ...payload,
            groupName,
            batchIndex,
          });
        } catch (err) {
          const msg = isCrypticWaEvaluateError(err)
            ? `WhatsApp store flake after create (${errorMessage(err)})`
            : errorMessage(err);
          console.warn(`[wa-automation] create "${groupName}" threw:`, msg);
          result = {
            status: 'error',
            action: 'create_group',
            message: msg,
            errorCode: 'CREATE_GROUP_FAILED',
          };
        }

        if (result.status === 'ok') {
          const detail = result.result ?? {};
          const groupId = String(detail.group_id ?? '').trim();
          if (!groupId) {
            failed.push(`${groupName}: created but peer id unresolved`);
            groupOutcomes.push({
              groupId: '',
              groupName,
              createStatus: 'failed',
            });
          } else {
            created += 1;
            groupOutcomes.push({
              groupId,
              groupName: String(detail.group_name ?? groupName).trim() || groupName,
              inviteLink:
                typeof detail.invite_link === 'string' ? detail.invite_link : undefined,
              createStatus: 'created',
            });
            onProgress(created, totalTarget, groupName);
          }
        } else {
          failed.push(`${groupName}: ${result.message ?? 'failed'}`);
          groupOutcomes.push({
            groupId: '',
            groupName,
            createStatus: 'failed',
          });
        }
        persistPartial();
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
        const groupOutcomes: Array<{
          groupId: string;
          expectedGroupId?: string;
          groupName?: string;
          inviteLink?: string;
          joinStatus: 'joined' | 'already_member' | 'failed';
          joinError?: string;
        }> = [];
        for (let i = 0; i < joinGroups.length; i += 1) {
          if (isJobStopRequested(payload.jobId)) {
            return {
              status: 'error',
              action: 'join_by_invite_link',
              message: `Stopped after ${success}/${joinGroups.length} groups`,
              errorCode: 'JOB_STOPPED',
              result: { success, total: joinGroups.length, failed, groupOutcomes },
            };
          }
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
            const expectedGroupId = group.groupId.trim();
            const deviceId = String(result.result?.group_id ?? '').trim();
            if (!deviceId) {
              const errMsg = 'Joined but peer id unresolved';
              failed.push(`${group.groupName ?? group.groupId}: ${errMsg}`);
              groupOutcomes.push({
                groupId: expectedGroupId || group.groupId,
                expectedGroupId: expectedGroupId || undefined,
                groupName: group.groupName,
                inviteLink: group.inviteLink,
                joinStatus: 'failed',
                joinError: errMsg,
              });
              continue;
            }
            success += 1;
            const alreadyMember = result.result?.already_member === true;
            const deviceName = String(result.result?.group_name ?? '').trim();
            groupOutcomes.push({
              groupId: deviceId,
              expectedGroupId: expectedGroupId || undefined,
              groupName: deviceName || group.groupName,
              inviteLink: group.inviteLink,
              joinStatus: alreadyMember ? 'already_member' : 'joined',
            });
            onProgress?.(i + 1, joinGroups.length, deviceName || group.groupName || 'Joined');
          } else {
            const errMsg = result.message ?? 'failed';
            failed.push(`${group.groupName ?? group.groupId}: ${errMsg}`);
            groupOutcomes.push({
              groupId: group.groupId,
              expectedGroupId: group.groupId.trim() || undefined,
              groupName: group.groupName,
              inviteLink: group.inviteLink,
              joinStatus: 'failed',
              joinError: errMsg,
            });
          }
        }
        return {
          status: success > 0 ? 'ok' : 'error',
          action: 'join_by_invite_link',
          message: `${success}/${joinGroups.length} joined`,
          errorCode: success > 0 ? undefined : 'JOIN_BATCH_FAILED',
          result: { success, total: joinGroups.length, failed, groupOutcomes },
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
        const groupOutcomes: Array<{
          groupId: string;
          groupName?: string;
          groupLink?: string;
          adminStatus?: 'promoted' | 'failed';
          adminError?: string;
        }> = [];
        for (let i = 0; i < adminGroups.length; i += 1) {
          if (isJobStopRequested(payload.jobId)) {
            return {
              status: 'error',
              action: 'set_admin',
              message: `Stopped after ${success}/${adminGroups.length} groups`,
              errorCode: 'JOB_STOPPED',
              result: { success, total: adminGroups.length, failed, groupOutcomes },
            };
          }
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
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              groupLink: group.groupLink,
              adminStatus: 'promoted',
            });
            onProgress?.(i + 1, adminGroups.length, group.groupName ?? 'Done');
          } else {
            const err = result.message ?? 'failed';
            failed.push(`${group.groupName ?? group.groupId}: ${err}`);
            groupOutcomes.push({
              groupId: group.groupId,
              groupName: group.groupName,
              groupLink: group.groupLink,
              adminStatus: 'failed',
              adminError: err,
            });
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
          result: { success, total: adminGroups.length, failed, groupOutcomes },
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
