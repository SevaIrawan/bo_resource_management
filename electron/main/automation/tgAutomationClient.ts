import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { withNetworkRetry } from '../lib/networkRetry';
import type { AutomationRunPayload, AutomationRunResult } from './types';

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

export async function runTelegramAutomation(payload: AutomationRunPayload): Promise<AutomationRunResult> {
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
    if (!payload.groupId?.trim() && !payload.groupLink?.trim()) {
      return {
        status: 'error',
        action: payload.action,
        message: 'groupId or groupLink required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }
    return postTelegramAutomation(payload.sessionId, `/telegram/automation/set-admin/${sid}`, {
      ...base,
      targets,
      groupId: payload.groupId?.trim() || undefined,
      groupLink: payload.groupLink?.trim() || undefined,
      adminRights: payload.adminRights ?? undefined,
    });
  }

  if (payload.action === 'join_by_invite_link') {
    if (!payload.inviteLink?.trim()) {
      return {
        status: 'error',
        action: payload.action,
        message: 'inviteLink required',
        errorCode: 'INVALID_PAYLOAD',
      };
    }
    return postTelegramAutomation(payload.sessionId, `/telegram/automation/join-invite/${sid}`, {
      ...base,
      inviteLink: payload.inviteLink.trim(),
    });
  }

  return {
    status: 'error',
    action: payload.action,
    message: `Unknown action: ${payload.action}`,
    errorCode: 'UNKNOWN_ACTION',
  };
}
