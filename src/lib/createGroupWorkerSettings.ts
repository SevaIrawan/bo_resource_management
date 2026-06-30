import {
  readTelegramWorkerSettings,
  readWhatsAppWorkerSettings,
  type WorkerCreateGroupSettings,
} from '@/config/workerPlatformSettings';
import type { Platform } from '@/types/database';

export type CreateGroupPermissionDraft = {
  messagesAdminsOnly: boolean;
  addMembersAdminsOnly: boolean;
  infoAdminsOnly: boolean;
  hideChatHistoryForMembers: boolean;
};

/** Settings page defaults — read-only seed for create-group SETUP modal. */
export function readCreateGroupWorkerSettings(platform: Platform): WorkerCreateGroupSettings {
  const settings =
    platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
  return settings.createGroup;
}

/** Map modal/job draft → enqueue payload (per-job override, not persisted to Settings). */
export function buildCreateGroupEnqueueSettings(
  platform: Platform,
  draft: CreateGroupPermissionDraft,
): {
  createGroupSettings?: {
    messagesAdminsOnly: boolean;
    addMembersAdminsOnly: boolean;
    infoAdminsOnly: boolean;
  };
  hideChatHistoryForMembers?: boolean;
} {
  if (platform === 'whatsapp') {
    return {
      createGroupSettings: {
        messagesAdminsOnly: draft.messagesAdminsOnly,
        addMembersAdminsOnly: draft.addMembersAdminsOnly,
        infoAdminsOnly: draft.infoAdminsOnly,
      },
    };
  }
  return {
    hideChatHistoryForMembers: draft.hideChatHistoryForMembers,
  };
}

export type CreateGroupJobDraftPermissions = {
  createGroupSettings?: {
    messagesAdminsOnly: boolean;
    addMembersAdminsOnly: boolean;
    infoAdminsOnly: boolean;
  };
  hideChatHistoryForMembers?: boolean;
};

/**
 * Enqueue path — job payload ONLY from SETUP modal draft.
 * Does not read Settings defaults (those seed modal on open only).
 */
export function buildCreateGroupEnqueueFromJobDraft(
  platform: Platform,
  draft: CreateGroupJobDraftPermissions,
): ReturnType<typeof buildCreateGroupEnqueueSettings> {
  if (platform === 'whatsapp') {
    const settings = draft.createGroupSettings;
    if (!settings) {
      throw new Error('CREATE_GROUP_SETTINGS_REQUIRED');
    }
    return buildCreateGroupEnqueueSettings(platform, {
      messagesAdminsOnly: settings.messagesAdminsOnly,
      addMembersAdminsOnly: settings.addMembersAdminsOnly,
      infoAdminsOnly: settings.infoAdminsOnly,
      hideChatHistoryForMembers: false,
    });
  }
  if (draft.hideChatHistoryForMembers === undefined) {
    throw new Error('CREATE_GROUP_HIDE_HISTORY_REQUIRED');
  }
  return buildCreateGroupEnqueueSettings(platform, {
    messagesAdminsOnly: false,
    addMembersAdminsOnly: false,
    infoAdminsOnly: false,
    hideChatHistoryForMembers: draft.hideChatHistoryForMembers,
  });
}
