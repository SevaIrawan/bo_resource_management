import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { withNetworkRetry } from '../lib/networkRetry';
import { resolveBrandPhotoWithFallback } from '../brandGroupPhoto';
import { resolveJoinGroups, resolveLeaveDeleteGroups, resolveSetAdminGroups } from './jobQueueBatchHelpers';
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
async function postTelegramAutomation(
  sessionId: string,
  path: string,
  body: Record<string, unknown>,
): Promise<AutomationRunResult> {
  await ensureSidecarRunning();

  return withNetworkRetry(`Telegram automation ${path}`, async () => {
    const res = await fetch(`${SIDECAR_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
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
  });
}

function humanizeTgJoinError(raw: string, link: string): string {
  if (!raw || raw.length <= 3) {
    return `Invite link rejected — link may be expired, revoked, or group is full (${link})`;
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
    return postTelegramAutomation(payload.sessionId, `/telegram/automation/create-group/${sid}`, {
      ...base,
      groupName: payload.groupName.trim(),
      description: payload.description ?? '',
      hideChatHistory: payload.hideChatHistory === true,
      batchIndex: payload.batchIndex ?? 1,
    });
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
    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      onProgress?.(i, groups.length, group.groupName ?? group.groupId);
      const result = await postTelegramAutomation(
        payload.sessionId,
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
        onProgress?.(i + 1, groups.length, group.groupName ?? 'Done');
      } else {
        failed.push(`${group.groupName ?? group.groupId}: ${result.message ?? 'failed'}`);
      }
      await sleepBetweenGroups(payload, i, groups.length);
    }
    return {
      status: success > 0 ? 'ok' : 'error',
      action: 'set_admin',
      message: `Promoted targets in ${success}/${groups.length} groups`,
      errorCode: success > 0 ? undefined : 'SET_ADMIN_BATCH_FAILED',
      result: { success, total: groups.length, failed },
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
    }> = [];

    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      onProgress?.(i, groups.length, group.groupName ?? group.groupId);
      const result = await postTelegramAutomation(
        payload.sessionId,
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
        });
      }
      await sleepBetweenGroups(payload, i, groups.length);
    }

    return {
      status: success > 0 ? 'ok' : 'error',
      action: 'set_group_photo',
      message: `Set photo ${success}/${groups.length} groups`,
      errorCode: success > 0 ? undefined : 'SET_GROUP_PHOTO_BATCH_FAILED',
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
        payload.sessionId,
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
        payload.sessionId,
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
      const group = groups[i];
      onProgress?.(i, groups.length, group.groupName ?? group.groupId);
      const result = await postTelegramAutomation(
        payload.sessionId,
        `/telegram/automation/leave-group/${sid}`,
        {
          ...base,
          groupId: group.groupId,
          groupLink: group.groupLink,
        },
      );
      if (result.status === 'ok') {
        success += 1;
        groupOutcomes.push({
          groupId: group.groupId,
          groupName: group.groupName,
          groupLink: group.groupLink,
          exitStatus: 'left',
        });
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
      status: success > 0 ? 'ok' : 'error',
      action: 'leave_group',
      message: `${baseMessage}${detailSuffix}`,
      errorCode: success > 0 ? undefined : 'LEAVE_GROUP_BATCH_FAILED',
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
      const group = groups[i];
      onProgress?.(i, groups.length, group.groupName ?? group.groupId);
      const result = await postTelegramAutomation(
        payload.sessionId,
        `/telegram/automation/delete-group/${sid}`,
        {
          ...base,
          groupId: group.groupId,
          groupLink: group.groupLink,
          requireOwner,
          clearChatHistory,
        },
      );
      if (result.status === 'ok') {
        success += 1;
        onProgress?.(i + 1, groups.length, group.groupName ?? 'Deleted');
      } else {
        failed.push(`${group.groupName ?? group.groupId}: ${result.message ?? 'failed'}`);
      }
      await sleepBetweenGroups(payload, i, groups.length);
    }
    return {
      status: success > 0 ? 'ok' : 'error',
      action: 'delete_group',
      message: `Deleted ${success}/${groups.length} groups`,
      errorCode: success > 0 ? undefined : 'DELETE_GROUP_BATCH_FAILED',
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
      groupName?: string;
      inviteLink?: string;
      joinStatus: 'joined' | 'already_member' | 'failed';
      joinError?: string;
    }> = [];
    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      onProgress?.(i, groups.length, group.groupName ?? group.groupId);
      const result = await postTelegramAutomation(
        payload.sessionId,
        `/telegram/automation/join-invite/${sid}`,
        {
          ...base,
          inviteLink: group.inviteLink,
          joinSequenceIndex: i + 1,
        },
      );
      if (result.status === 'ok') {
        success += 1;
        const alreadyMember = result.result?.already_member === true;
        groupOutcomes.push({
          groupId: group.groupId,
          groupName: group.groupName,
          inviteLink: group.inviteLink,
          joinStatus: alreadyMember ? 'already_member' : 'joined',
        });
        onProgress?.(i + 1, groups.length, group.groupName ?? 'Joined');
      } else {
        const rawErr = result.message ?? 'failed';
        const errMsg = humanizeTgJoinError(rawErr, group.inviteLink ?? '');
        failed.push(`${group.groupName ?? group.groupId}: ${errMsg}`);
        groupOutcomes.push({
          groupId: group.groupId,
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
      message: `${success}/${groups.length} joined`,
      errorCode: success > 0 ? undefined : 'JOIN_BATCH_FAILED',
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
  }> = [];
  onProgress(0, totalTarget, prefix);

  for (let i = 0; i < totalTarget; i += 1) {
    const num = startFrom + i;
    const groupName = resolveCreateBatchGroupName(prefix, num, totalTarget, useNumbering);
    onProgress(created, totalTarget, groupName);

    const result = await runTelegramAutomation({
      ...payload,
      action: 'create_group',
      groupName,
      batchIndex: created + 1,
    });

    if (result.status === 'ok') {
      created += 1;
      const detail = result.result ?? {};
      groupOutcomes.push({
        groupId: String(detail.group_id ?? '').trim(),
        groupName: String(detail.group_name ?? groupName).trim() || groupName,
        inviteLink: typeof detail.invite_link === 'string' ? detail.invite_link : undefined,
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
}
