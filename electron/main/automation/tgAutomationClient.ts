import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { withNetworkRetry } from '../lib/networkRetry';
import { resolveBrandPhotoWithFallback } from '../brandGroupPhoto';
import { resolveJoinGroups, resolveLeaveDeleteGroups, resolveSetAdminGroups } from './jobQueueBatchHelpers';
import { attachJobGroupOutcomes, peekJobStopRequest } from './jobQueueStore';
import type { AutomationRunPayload, AutomationRunResult, AutomationProgressCallback } from './types';
import {
  createGroupBatchUsesNumbering,
  resolveCreateBatchGroupName,
} from './createGroupBatchNaming';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs(baseMs: number, jitterPercent = 35): number {
  const jitter = jitterPercent / 100;
  const low = baseMs * (1 - jitter);
  const high = baseMs * (1 + jitter);
  return Math.max(100, Math.floor(low + Math.random() * (high - low)));
}

async function sleepBetweenGroups(payload: AutomationRunPayload, index: number, total: number): Promise<void> {
  if (index >= total - 1) return;
  const betweenSec = payload.delay?.between_groups_sec ?? 60;
  const jitterPercent = payload.delay?.jitter_percent ?? 35;
  await sleep(jitterMs(betweenSec * 1000, jitterPercent));
}

function isJobStopRequested(jobId?: string): boolean {
  return Boolean(jobId && peekJobStopRequest(jobId));
}
async function postTelegramAutomation(
  path: string,
  body: Record<string, unknown>,
  options?: { retry?: boolean; timeoutMs?: number },
): Promise<AutomationRunResult> {
  await ensureSidecarRunning();

  const timeoutMs = Math.max(60_000, options?.timeoutMs ?? 600_000);

  const runOnce = async (): Promise<AutomationRunResult> => {
    const res = await fetch(`${SIDECAR_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const json = (await res.json()) as AutomationRunResult & { message?: string };
    if (!res.ok && json.status !== 'ok') {
      return {
        status: 'error',
        action: json.action ?? 'create_group',
        message: json.message ?? `HTTP ${res.status}`,
        errorCode: json.errorCode ?? 'HTTP_ERROR',
      };
    }
    return json;
  };

  // Create group TIDAK idempotent — retry POST setelah sidecar sukses → duplikat nama di device.
  if (options?.retry === false) {
    return runOnce();
  }

  return withNetworkRetry(`Telegram automation ${path}`, () => runOnce());
}

function formatSetAdminFailure(result: AutomationRunResult): string {
  const detail = result.result ?? {};
  const bits: string[] = [];
  const skipped = Array.isArray(detail.skipped) ? detail.skipped : [];
  const errors = Array.isArray(detail.errors) ? detail.errors : [];
  for (const row of skipped) {
    if (!row || typeof row !== 'object') continue;
    const target = String((row as { target?: string }).target ?? '').trim();
    const reason = String((row as { reason?: string }).reason ?? '').trim();
    if (target || reason) bits.push(`${target || '?'}:${reason || 'skipped'}`);
  }
  for (const row of errors) {
    if (!row || typeof row !== 'object') continue;
    const target = String((row as { target?: string }).target ?? '').trim();
    const error = String((row as { error?: string }).error ?? '').trim();
    if (target || error) bits.push(`${target || '?'}:${error || 'error'}`);
  }
  if (bits.length) return bits.join('; ').slice(0, 400);
  return result.message?.trim() || 'No targets promoted';
}

function batchResultStatus(success: number, total: number): 'ok' | 'error' {
  if (total <= 0) return success > 0 ? 'ok' : 'error';
  return success >= total ? 'ok' : 'error';
}

function humanizeTgJoinError(raw: string, link: string): string {
  if (!raw || raw.length <= 3) {
    return `Invite link rejected — link may be expired, revoked, or group is full (${link})`;
  }
  if (/fetch failed|econnreset|econnrefused|network|socket/i.test(raw)) {
    return `Network error talking to Telegram sidecar — retry join (${link})`;
  }
  if (/timeout/i.test(raw)) {
    return `Timeout waiting for Telegram to accept invite (${link})`;
  }
  if (/revoke|reset|invalid|expire|INVITE_HASH_EXPIRED/i.test(raw)) {
    return `Invite link expired or revoked (${link})`;
  }
  if (/flood/i.test(raw)) {
    return `FloodWait — too many join requests, try again later (${link})`;
  }
  if (/USER_ALREADY_PARTICIPANT/i.test(raw)) {
    return `Already a member of this group (${link})`;
  }
  if (/CHANNELS_TOO_MUCH/i.test(raw)) {
    return `Account has joined too many groups/channels (${link})`;
  }
  return raw;
}

function isJoinTransportError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('network') ||
    lower.includes('aborted due to timeout') ||
    lower.includes('operation was aborted')
  );
}

/** Parse FloodWait N dari pesan sidecar — sleep di Electron (luar HTTP). */
function parseFloodWaitSeconds(message: string | undefined, errorCode?: string): number | null {
  if (errorCode !== 'FLOOD_WAIT_RETRY' && errorCode !== 'FLOOD_WAIT') return null;
  const match = String(message ?? '').match(/FloodWait\s+(\d+)/i);
  if (!match) return null;
  const sec = Number(match[1]);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  // Cap 15 menit — jangan blok job selamanya pada flood ekstrem.
  return Math.min(Math.floor(sec), 15 * 60);
}

async function postJoinInviteOnce(
  sid: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<AutomationRunResult> {
  return postTelegramAutomation(`/telegram/automation/join-invite/${sid}`, body, {
    retry: false,
    timeoutMs,
  });
}

export async function runTelegramAutomation(
  payload: AutomationRunPayload,
  onProgress?: AutomationProgressCallback,
): Promise<AutomationRunResult> {
  const sid = encodeURIComponent(payload.sessionId);
  const base = {
    sessionString: payload.storedSessionString ?? undefined,
    expectedPhone: payload.expectedPhone ?? undefined,
    delay: payload.delay ?? undefined,
  };

  if (payload.action === 'create_group') {
    if (!payload.groupName?.trim()) {
      return {
        status: 'error',
        action: payload.action,
        message: 'groupName required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }
    return postTelegramAutomation(
      `/telegram/automation/create-group/${sid}`,
      {
        ...base,
        groupName: payload.groupName.trim(),
        description: payload.description ?? '',
        hideChatHistory: payload.hideChatHistory === true,
        batchIndex: payload.batchIndex ?? 1,
      },
      { retry: false, timeoutMs: 20 * 60 * 1000 },
    );
  }

  if (payload.action === 'set_admin') {
    const targets = (payload.targets ?? []).map((t) => t.trim()).filter(Boolean);
    if (!targets.length) {
      return {
        status: 'error',
        action: payload.action,
        message: 'targets required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }
    const groups = resolveSetAdminGroups(payload);
    if (groups.length === 0) {
      return {
        status: 'error',
        action: payload.action,
        message: 'groupId or groupLink required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }

    let success = 0;
    const failed: string[] = [];
    const groupOutcomes: Array<{
      groupId: string;
      groupName?: string;
      groupLink?: string;
      adminStatus: 'promoted' | 'failed';
      adminError?: string;
    }> = [];
    for (let i = 0; i < groups.length; i += 1) {
      if (isJobStopRequested(payload.jobId)) {
        return {
          status: success > 0 ? 'ok' : 'error',
          action: 'set_admin',
          message: 'Stopped by user',
          errorCode: 'JOB_STOPPED',
          result: { success, total: groups.length, failed, groupOutcomes },
        };
      }
      const group = groups[i];
      onProgress?.(i, groups.length, group.groupName ?? group.groupId);
      const result = await postTelegramAutomation(
        `/telegram/automation/set-admin/${sid}`,
        {
          ...base,
          targets,
          groupId: group.groupId,
          groupLink: group.groupLink,
          adminRights: payload.adminRights ?? undefined,
        },
      );
      if (result.status === 'ok') {
        success += 1;
        groupOutcomes.push({
          groupId: group.groupId,
          groupName: group.groupName,
          groupLink: group.groupLink,
          adminStatus: 'promoted',
        });
        onProgress?.(i + 1, groups.length, group.groupName ?? 'Done');
      } else {
        const adminError = formatSetAdminFailure(result);
        failed.push(`${group.groupName ?? group.groupId}: ${adminError}`);
        groupOutcomes.push({
          groupId: group.groupId,
          groupName: group.groupName,
          groupLink: group.groupLink,
          adminStatus: 'failed',
          adminError,
        });
      }
      await sleepBetweenGroups(payload, i, groups.length);
    }
    return {
      status: batchResultStatus(success, groups.length),
      action: 'set_admin',
      message: `Promoted targets in ${success}/${groups.length} groups`,
      errorCode:
        success >= groups.length
          ? undefined
          : success > 0
            ? 'SET_ADMIN_PARTIAL'
            : 'SET_ADMIN_BATCH_FAILED',
      result: { success, total: groups.length, failed, groupOutcomes },
    };
  }

  if (payload.action === 'set_group_photo') {
    let photoPath = payload.photoPath?.trim() ?? '';

    if (!photoPath) {
      const brandName = payload.brandName?.trim();
      if (brandName) {
        const resolved = await resolveBrandPhotoWithFallback(brandName, payload.userId);
        if (resolved) photoPath = resolved;
      }
    }

    if (!photoPath) {
      return {
        status: 'error',
        action: payload.action,
        message: 'photoPath required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }
    const groups = resolveSetAdminGroups(payload);
    if (groups.length === 0) {
      return {
        status: 'error',
        action: payload.action,
        message: 'groups required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }

    let success = 0;
    const failed: string[] = [];
    const groupOutcomes: Array<{
      groupId: string;
      groupName?: string;
      photoStatus: 'set' | 'failed';
      photoError?: string;
    }> = [];

    for (let i = 0; i < groups.length; i += 1) {
      if (isJobStopRequested(payload.jobId)) {
        return {
          status: success > 0 ? 'ok' : 'error',
          action: 'set_group_photo',
          message: 'Stopped by user',
          errorCode: 'JOB_STOPPED',
          result: { success, total: groups.length, failed, groupOutcomes },
        };
      }
      const group = groups[i];
      onProgress?.(i, groups.length, group.groupName ?? group.groupId);
      const result = await postTelegramAutomation(
        `/telegram/automation/set-group-photo/${sid}`,
        {
          ...base,
          photoPath,
          groupId: group.groupId,
          groupLink: group.groupLink,
        },
      );
      if (result.status === 'ok') {
        success += 1;
        groupOutcomes.push({
          groupId: group.groupId,
          groupName: group.groupName,
          photoStatus: 'set',
        });
        onProgress?.(i + 1, groups.length, group.groupName ?? 'Photo set');
      } else {
        failed.push(`${group.groupName ?? group.groupId}: ${result.message ?? 'failed'}`);
        groupOutcomes.push({
          groupId: group.groupId,
          groupName: group.groupName,
          photoStatus: 'failed',
          photoError: result.message ?? 'failed',
        });
      }
      await sleepBetweenGroups(payload, i, groups.length);
    }

    return {
      status: batchResultStatus(success, groups.length),
      action: 'set_group_photo',
      message: `Set photo ${success}/${groups.length} groups`,
      errorCode:
        success >= groups.length
          ? undefined
          : success > 0
            ? 'SET_GROUP_PHOTO_PARTIAL'
            : 'SET_GROUP_PHOTO_BATCH_FAILED',
      result: { success, total: groups.length, failed, groupOutcomes },
    };
  }

  if (payload.action === 'exit_delete_group') {
    const groups = resolveLeaveDeleteGroups(payload);
    if (groups.length === 0) {
      return {
        status: 'error',
        action: payload.action,
        message: 'groupId or groupLink required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }

    const requireOwner = payload.leaveDelete?.requireOwnerForDelete !== false;
    const clearChatHistory = payload.leaveDelete?.clearChatHistoryOnDelete === true;

    let left = 0;
    let deleted = 0;
    let exited = 0;
    const failed: string[] = [];

    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      const label = group.groupName ?? group.groupId;
      onProgress?.(exited, groups.length, `Leave: ${label}`);

      const leaveResult = await postTelegramAutomation(
        `/telegram/automation/leave-group/${sid}`,
        {
          ...base,
          groupId: group.groupId,
          groupLink: group.groupLink,
        },
      );

      if (leaveResult.status !== 'ok') {
        failed.push(`${label}: leave ${leaveResult.message ?? 'failed'}`);
        continue;
      }

      left += 1;
      onProgress?.(exited, groups.length, `Delete: ${label}`);

      const deleteResult = await postTelegramAutomation(
        `/telegram/automation/delete-group/${sid}`,
        {
          ...base,
          groupId: group.groupId,
          groupLink: group.groupLink,
          requireOwner,
          clearChatHistory,
        },
      );

      if (deleteResult.status === 'ok') {
        deleted += 1;
        exited += 1;
        onProgress?.(exited, groups.length, `Exited: ${label}`);
      } else {
        failed.push(`${label}: left OK, delete ${deleteResult.message ?? 'failed'}`);
      }
    }

    return {
      status: exited > 0 ? 'ok' : 'error',
      action: 'exit_delete_group',
      message: `Exited ${exited}/${groups.length} (left ${left}, deleted ${deleted})`,
      errorCode: exited > 0 ? undefined : 'EXIT_DELETE_GROUP_FAILED',
      result: { success: exited, total: groups.length, left, deleted, failed },
    };
  }

  if (payload.action === 'leave_group') {
    const groups = resolveLeaveDeleteGroups(payload);
    if (groups.length === 0) {
      return {
        status: 'error',
        action: payload.action,
        message: 'groupId or groupLink required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }

    let success = 0;
    const failed: string[] = [];
    const groupOutcomes: Array<{
      groupId: string;
      groupName?: string;
      groupLink?: string;
      exitStatus: 'left' | 'failed';
      exitError?: string;
    }> = [];
    for (let i = 0; i < groups.length; i += 1) {
      if (isJobStopRequested(payload.jobId)) {
        return {
          status: success > 0 ? 'ok' : 'error',
          action: 'leave_group',
          message: 'Stopped by user',
          errorCode: 'JOB_STOPPED',
          result: { success, total: groups.length, failed, groupOutcomes },
        };
      }
      const group = groups[i];
      onProgress?.(i, groups.length, group.groupName ?? group.groupId);
      let result: AutomationRunResult;
      try {
        result = await postTelegramAutomation(
          `/telegram/automation/leave-group/${sid}`,
          {
            ...base,
            groupId: group.groupId,
            groupLink: group.groupLink,
          },
        );
      } catch (err) {
        const exitError = err instanceof Error ? err.message : String(err);
        failed.push(`${group.groupName ?? group.groupId}: ${exitError}`);
        groupOutcomes.push({
          groupId: group.groupId,
          groupName: group.groupName,
          groupLink: group.groupLink,
          exitStatus: 'failed',
          exitError,
        });
        if (payload.jobId) {
          attachJobGroupOutcomes(payload.jobId, {
            groupOutcomes: [...groupOutcomes],
            progressCurrent: Math.min(i + 1, groups.length),
          });
        }
        onProgress?.(i + 1, groups.length, group.groupName ?? 'Exit failed');
        await sleepBetweenGroups(payload, i, groups.length);
        continue;
      }
      if (result.status === 'ok') {
        success += 1;
        groupOutcomes.push({
          groupId: group.groupId,
          groupName: group.groupName,
          groupLink: group.groupLink,
          exitStatus: 'left',
        });
        if (payload.jobId) {
          attachJobGroupOutcomes(payload.jobId, {
            groupOutcomes: [...groupOutcomes],
            progressCurrent: Math.min(i + 1, groups.length),
          });
        }
        onProgress?.(i + 1, groups.length, group.groupName ?? 'Left');
      } else {
        const exitError = result.message ?? 'failed';
        failed.push(`${group.groupName ?? group.groupId}: ${exitError}`);
        groupOutcomes.push({
          groupId: group.groupId,
          groupName: group.groupName,
          groupLink: group.groupLink,
          exitStatus: 'failed',
          exitError,
        });
        if (payload.jobId) {
          attachJobGroupOutcomes(payload.jobId, {
            groupOutcomes: [...groupOutcomes],
            progressCurrent: Math.min(i + 1, groups.length),
          });
        }
        onProgress?.(i + 1, groups.length, group.groupName ?? 'Exit failed');
      }
      await sleepBetweenGroups(payload, i, groups.length);
    }
    const baseMessage = `Left ${success}/${groups.length} groups`;
    const detailSuffix =
      failed.length > 0
        ? ` — ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? ` (+${failed.length - 3} more)` : ''}`
        : '';
    return {
      status: batchResultStatus(success, groups.length),
      action: 'leave_group',
      message: `${baseMessage}${detailSuffix}`,
      errorCode:
        success >= groups.length
          ? undefined
          : success > 0
            ? 'LEAVE_GROUP_PARTIAL'
            : 'LEAVE_GROUP_BATCH_FAILED',
      result: { success, total: groups.length, failed, groupOutcomes },
    };
  }

  if (payload.action === 'delete_group') {
    const groups = resolveLeaveDeleteGroups(payload);
    if (groups.length === 0) {
      return {
        status: 'error',
        action: payload.action,
        message: 'groupId or groupLink required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }

    const requireOwner = payload.leaveDelete?.requireOwnerForDelete !== false;
    const clearChatHistory = payload.leaveDelete?.clearChatHistoryOnDelete === true;

    let success = 0;
    const failed: string[] = [];
    for (let i = 0; i < groups.length; i += 1) {
      if (isJobStopRequested(payload.jobId)) {
        return {
          status: success > 0 ? 'ok' : 'error',
          action: 'delete_group',
          message: 'Stopped by user',
          errorCode: 'JOB_STOPPED',
          result: { success, total: groups.length, failed },
        };
      }
      const group = groups[i];
      onProgress?.(i, groups.length, group.groupName ?? group.groupId);
      let result: AutomationRunResult;
      try {
        result = await postTelegramAutomation(
          `/telegram/automation/delete-group/${sid}`,
          {
            ...base,
            groupId: group.groupId,
            groupLink: group.groupLink,
            requireOwner,
            clearChatHistory,
          },
        );
      } catch (err) {
        failed.push(
          `${group.groupName ?? group.groupId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        onProgress?.(i + 1, groups.length, group.groupName ?? 'Delete failed');
        await sleepBetweenGroups(payload, i, groups.length);
        continue;
      }
      if (result.status === 'ok') {
        success += 1;
        onProgress?.(i + 1, groups.length, group.groupName ?? 'Deleted');
      } else {
        failed.push(`${group.groupName ?? group.groupId}: ${result.message ?? 'failed'}`);
      }
      await sleepBetweenGroups(payload, i, groups.length);
    }
    return {
      status: batchResultStatus(success, groups.length),
      action: 'delete_group',
      message: `Deleted ${success}/${groups.length} groups`,
      errorCode:
        success >= groups.length
          ? undefined
          : success > 0
            ? 'DELETE_GROUP_PARTIAL'
            : 'DELETE_GROUP_BATCH_FAILED',
      result: { success, total: groups.length, failed },
    };
  }

  if (payload.action === 'join_by_invite_link') {
    const groups = resolveJoinGroups(payload);
    if (groups.length === 0) {
      return {
        status: 'error',
        action: payload.action,
        message: 'inviteLink required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }

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
    /** Delay di Electron (di luar HTTP) — sidecar skipInviteDelay. HTTP hanya kerja API. */
    const joinTimeoutMs = 2 * 60 * 1000;
    const batchEvery = Math.max(1, Number(payload.delay?.invite_batch_every ?? 10));
    const delayMinSec = Number(payload.delay?.invite_delay_min_sec ?? 30);
    const delayMaxSec = Number(payload.delay?.invite_delay_max_sec ?? 60);
    const batchMinSec = Number(payload.delay?.invite_batch_delay_min_sec ?? 180);
    const batchMaxSec = Number(payload.delay?.invite_batch_delay_max_sec ?? 360);

    async function sleepJoinGap(sequenceIndex: number): Promise<void> {
      if (sequenceIndex <= 1) return;
      const useBatch = batchEvery > 0 && sequenceIndex % batchEvery === 0;
      const lo = useBatch ? batchMinSec : delayMinSec;
      const hi = useBatch ? batchMaxSec : delayMaxSec;
      const sec = lo + Math.random() * Math.max(0, hi - lo);
      const jitterPercent = payload.delay?.jitter_percent ?? 35;
      await sleep(jitterMs(sec * 1000, jitterPercent));
    }

    for (let i = 0; i < groups.length; i += 1) {
      if (isJobStopRequested(payload.jobId)) {
        if (payload.jobId) {
          attachJobGroupOutcomes(payload.jobId, { groupOutcomes: [...groupOutcomes] });
        }
        return {
          status: success > 0 ? 'ok' : 'error',
          action: 'join_by_invite_link',
          message: 'Stopped by user',
          errorCode: 'JOB_STOPPED',
          result: { success, total: groups.length, failed, groupOutcomes },
        };
      }
      const group = groups[i];
      const expectedGroupId = group.groupId.trim();
      onProgress?.(i, groups.length, group.groupName ?? group.groupId);
      await sleepJoinGap(i + 1);
      const joinBody = {
        ...base,
        inviteLink: group.inviteLink,
        joinSequenceIndex: i + 1,
        skipInviteDelay: true,
        expectedGroupId: expectedGroupId || undefined,
      };
      let result: AutomationRunResult;
      try {
        result = await postJoinInviteOnce(sid, joinBody, joinTimeoutMs);
        // FloodWait panjang: sleep di Electron (bukan di sidecar HTTP) lalu 1× retry.
        const floodSec = parseFloodWaitSeconds(result.message, result.errorCode);
        if (result.status !== 'ok' && floodSec != null) {
          onProgress?.(i, groups.length, `FloodWait ${floodSec}s…`);
          await sleep(floodSec * 1000 + 1500);
          if (isJobStopRequested(payload.jobId)) {
            if (payload.jobId) {
              attachJobGroupOutcomes(payload.jobId, { groupOutcomes: [...groupOutcomes] });
            }
            return {
              status: success > 0 ? 'ok' : 'error',
              action: 'join_by_invite_link',
              message: 'Stopped by user',
              errorCode: 'JOB_STOPPED',
              result: { success, total: groups.length, failed, groupOutcomes },
            };
          }
          result = await postJoinInviteOnce(sid, joinBody, joinTimeoutMs);
        }
      } catch (err) {
        const rawErr = err instanceof Error ? err.message : String(err);
        // Transport sekali putus — 1× retry (bukan retry invite sukses / create).
        if (isJoinTransportError(rawErr) && !isJobStopRequested(payload.jobId)) {
          onProgress?.(i, groups.length, 'Retry network…');
          await sleep(1500);
          try {
            result = await postJoinInviteOnce(sid, joinBody, joinTimeoutMs);
          } catch (err2) {
            const raw2 = err2 instanceof Error ? err2.message : String(err2);
            const errMsg = humanizeTgJoinError(raw2, group.inviteLink ?? '');
            failed.push(`${group.groupName ?? group.groupId}: ${errMsg}`);
            groupOutcomes.push({
              groupId: expectedGroupId || group.groupId,
              expectedGroupId: expectedGroupId || undefined,
              groupName: group.groupName,
              inviteLink: group.inviteLink,
              joinStatus: 'failed',
              joinError: errMsg,
            });
            if (payload.jobId) {
              attachJobGroupOutcomes(payload.jobId, {
                groupOutcomes: [...groupOutcomes],
                progressCurrent: Math.min(i + 1, groups.length),
              });
            }
            continue;
          }
        } else {
          const errMsg = humanizeTgJoinError(rawErr, group.inviteLink ?? '');
          failed.push(`${group.groupName ?? group.groupId}: ${errMsg}`);
          groupOutcomes.push({
            groupId: expectedGroupId || group.groupId,
            expectedGroupId: expectedGroupId || undefined,
            groupName: group.groupName,
            inviteLink: group.inviteLink,
            joinStatus: 'failed',
            joinError: errMsg,
          });
          if (payload.jobId) {
            attachJobGroupOutcomes(payload.jobId, {
              groupOutcomes: [...groupOutcomes],
              progressCurrent: Math.min(i + 1, groups.length),
            });
          }
          continue;
        }
      }
      if (result.status === 'ok') {
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
        } else {
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
          onProgress?.(i + 1, groups.length, deviceName || group.groupName || 'Joined');
        }
      } else {
        const rawErr = result.message ?? 'failed';
        const errMsg = humanizeTgJoinError(rawErr, group.inviteLink ?? '');
        failed.push(`${group.groupName ?? group.groupId}: ${errMsg}`);
        groupOutcomes.push({
          groupId: expectedGroupId || group.groupId,
          expectedGroupId: expectedGroupId || undefined,
          groupName: group.groupName,
          inviteLink: group.inviteLink,
          joinStatus: 'failed',
          joinError: errMsg,
        });
      }
      if (payload.jobId) {
        attachJobGroupOutcomes(payload.jobId, {
          groupOutcomes: [...groupOutcomes],
          progressCurrent: Math.min(
            groupOutcomes.filter(
              (r) => r.joinStatus === 'joined' || r.joinStatus === 'already_member',
            ).length,
            groups.length,
          ),
        });
      }
    }
    return {
      status: batchResultStatus(success, groups.length),
      action: 'join_by_invite_link',
      message: `${success}/${groups.length} joined`,
      errorCode:
        success >= groups.length
          ? undefined
          : success > 0
            ? 'JOIN_PARTIAL'
            : 'JOIN_BATCH_FAILED',
      result: { success, total: groups.length, failed, groupOutcomes },
    };
  }

  return {
    status: 'error',
    action: payload.action,
    message: `Unknown action: ${payload.action}`,
    errorCode: 'UNKNOWN_ACTION',
  };
}

export async function runTelegramCreateGroupBatch(
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

  let created = 0;
  const failed: string[] = [];
  const groupOutcomes: Array<{
    groupId: string;
    groupName?: string;
    inviteLink?: string;
    createStatus: 'created' | 'failed';
    createError?: string;
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

  for (let i = 0; i < totalTarget; i += 1) {
    if (isJobStopRequested(payload.jobId)) {
      persistPartial();
      return {
        status: batchResultStatus(created, totalTarget),
        action: 'create_group',
        message: 'Stopped by user',
        errorCode: 'JOB_STOPPED',
        result: { success: created, total: totalTarget, failed, groupOutcomes },
      };
    }
    const num = startFrom + i;
    const groupName = resolveCreateBatchGroupName(prefix, num, totalTarget, useNumbering);
    onProgress(created, totalTarget, groupName);

    // Delay antar grup di Electron — jangan di dalam HTTP sidecar (timeout/orphan).
    if (i > 0) {
      await sleepBetweenGroups(payload, i - 1, totalTarget);
    }

    let result: AutomationRunResult;
    try {
      result = await runTelegramAutomation({
        ...payload,
        action: 'create_group',
        groupName,
        batchIndex: 1,
      });
    } catch (err) {
      // Jaringan putus setelah create di device — jangan retry create; catat failed item, lanjut batch.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[tg-automation] create "${groupName}" threw (no retry):`, msg);
      result = {
        status: 'error',
        action: 'create_group',
        message: msg,
        errorCode: 'CREATE_GROUP_TRANSPORT',
      };
    }

    if (result.status === 'ok') {
      const detail = result.result ?? {};
      const groupId = String(detail.group_id ?? '').trim();
      if (!groupId) {
        const createError = 'created but peer id unresolved';
        failed.push(`${groupName}: ${createError}`);
        groupOutcomes.push({
          groupId: '',
          groupName,
          createStatus: 'failed',
          createError,
        });
      } else {
        created += 1;
        groupOutcomes.push({
          groupId,
          groupName: String(detail.group_name ?? groupName).trim() || groupName,
          inviteLink: typeof detail.invite_link === 'string' ? detail.invite_link : undefined,
          createStatus: 'created',
        });
        onProgress(created, totalTarget, groupName);
      }
    } else {
      const createError = result.message ?? 'failed';
      failed.push(`${groupName}: ${createError}`);
      groupOutcomes.push({
        groupId: '',
        groupName,
        createStatus: 'failed',
        createError,
      });
    }
    persistPartial();
  }

  return {
    status: batchResultStatus(created, totalTarget),
    action: 'create_group',
    message:
      failed.length > 0
        ? `${created}/${totalTarget} created (${failed.length} failed)`
        : `${created}/${totalTarget} created`,
    errorCode:
      created >= totalTarget
        ? undefined
        : created > 0
          ? 'CREATE_GROUP_PARTIAL'
          : 'CREATE_GROUP_BATCH_FAILED',
    result: { success: created, total: totalTarget, failed, groupOutcomes },
  };
}
