import type { AutomationJobDelayConfig } from '@/types/automationJob';

export const WHATSAPP_WORKER_SETTINGS_STORAGE_KEY = 'rm_worker_settings_whatsapp';
export const TELEGRAM_WORKER_SETTINGS_STORAGE_KEY = 'rm_worker_settings_telegram';

export type HumanDelayProfile = 'safe' | 'fast' | 'off';

export interface WorkerStandardSettings {
  perRun: number;
  betweenGroupsSec: number;
  betweenTargetsSec: number;
  afterCreateSec: number;
  floodWaitExtraSec: number;
  maxFloodwaitAutoSleepSec: number;
  /** TG set_group_photo.py — retry unggah foto */
  setPhotoMaxRetry: number;
  humanProfile: HumanDelayProfile;
  pauseBetweenRunsMinLow: number;
  pauseBetweenRunsMinHigh: number;
  pauseBetweenScriptsMinLow: number;
  pauseBetweenScriptsMinHigh: number;
}

/** Telegram ChatAdminRights — map ke learning config.json admin.rights */
export interface TelegramAdminRightsSettings {
  changeInfo: boolean;
  postMessages: boolean;
  editMessages: boolean;
  deleteMessages: boolean;
  banUsers: boolean;
  inviteUsers: boolean;
  pinMessages: boolean;
  addAdmins: boolean;
  manageCall: boolean;
  anonymous: boolean;
  /** Telethon ChatAdminRights.delete_stories (NEXPAY scripts) */
  deleteStories: boolean;
}

export interface WorkerCreateGroupSettings {
  /** TG: TogglePreHistoryHiddenRequest */
  hideChatHistoryForMembers: boolean;
  /** WA: setMessagesAdminsOnly */
  messagesAdminsOnly: boolean;
  /** WA: setAddMembersAdminsOnly */
  addMembersAdminsOnly: boolean;
  /** WA: setInfoAdminsOnly */
  infoAdminsOnly: boolean;
  /** TG: hak saat promote admin (set_admin.py) */
  telegramAdminRights: TelegramAdminRightsSettings;
}

/** Invite / join via link — terpisah dari delay standard mass-create */
export interface WorkerInviteLinkSettings {
  delayMinSec: number;
  delayMaxSec: number;
  batchEvery: number;
  batchDelayMinSec: number;
  batchDelayMaxSec: number;
  maxPerRun: number;
  inviteExportRetries: number;
  inviteExportRetrySec: number;
}

export interface WorkerSetAdminSettings {
  maxAdminSlots: number;
  betweenTargetsSec: number;
  resolveEntityMaxAttempts: number;
}

export interface WorkerLeaveDeleteSettings {
  leaveEnabled: boolean;
  deleteEnabled: boolean;
  /** TG delete_groups: require_owner */
  requireOwnerForDelete: boolean;
  /** WA: clear chat saat delete */
  clearChatHistoryOnDelete: boolean;
  betweenGroupsSec: number;
}

export interface PlatformWorkerSettings {
  standard: WorkerStandardSettings;
  createGroup: WorkerCreateGroupSettings;
  inviteLink: WorkerInviteLinkSettings;
  setAdmin: WorkerSetAdminSettings;
  leaveDelete: WorkerLeaveDeleteSettings;
}

const SAFE_STANDARD: WorkerStandardSettings = {
  perRun: 30,
  betweenGroupsSec: 90,
  betweenTargetsSec: 30,
  afterCreateSec: 90,
  floodWaitExtraSec: 60,
  maxFloodwaitAutoSleepSec: 7200,
  setPhotoMaxRetry: 1,
  humanProfile: 'safe',
  pauseBetweenRunsMinLow: 45,
  pauseBetweenRunsMinHigh: 65,
  pauseBetweenScriptsMinLow: 45,
  pauseBetweenScriptsMinHigh: 65,
};

const SAFE_TELEGRAM_ADMIN_RIGHTS: TelegramAdminRightsSettings = {
  changeInfo: false,
  postMessages: true,
  editMessages: false,
  deleteMessages: false,
  banUsers: false,
  inviteUsers: true,
  pinMessages: false,
  addAdmins: false,
  manageCall: false,
  anonymous: false,
  deleteStories: false,
};

const SAFE_INVITE_LINK: WorkerInviteLinkSettings = {
  delayMinSec: 30,
  delayMaxSec: 60,
  batchEvery: 10,
  batchDelayMinSec: 180,
  batchDelayMaxSec: 360,
  maxPerRun: 30,
  inviteExportRetries: 5,
  inviteExportRetrySec: 5,
};

const SAFE_SET_ADMIN: WorkerSetAdminSettings = {
  maxAdminSlots: 5,
  betweenTargetsSec: 30,
  resolveEntityMaxAttempts: 3,
};

const SAFE_LEAVE_DELETE: WorkerLeaveDeleteSettings = {
  leaveEnabled: true,
  deleteEnabled: false,
  requireOwnerForDelete: true,
  clearChatHistoryOnDelete: false,
  betweenGroupsSec: 60,
};

export function defaultWhatsAppWorkerSettings(): PlatformWorkerSettings {
  return {
    standard: { ...SAFE_STANDARD, perRun: 20, betweenGroupsSec: 120, setPhotoMaxRetry: 0 },
    createGroup: {
      hideChatHistoryForMembers: false,
      messagesAdminsOnly: false,
      addMembersAdminsOnly: true,
      infoAdminsOnly: true,
      telegramAdminRights: { ...SAFE_TELEGRAM_ADMIN_RIGHTS },
    },
    inviteLink: { ...SAFE_INVITE_LINK },
    setAdmin: { ...SAFE_SET_ADMIN },
    leaveDelete: { ...SAFE_LEAVE_DELETE },
  };
}

export function defaultTelegramWorkerSettings(): PlatformWorkerSettings {
  return {
    standard: { ...SAFE_STANDARD },
    createGroup: {
      hideChatHistoryForMembers: true,
      messagesAdminsOnly: false,
      addMembersAdminsOnly: false,
      infoAdminsOnly: false,
      telegramAdminRights: { ...SAFE_TELEGRAM_ADMIN_RIGHTS },
    },
    inviteLink: { ...SAFE_INVITE_LINK },
    setAdmin: { ...SAFE_SET_ADMIN },
    leaveDelete: { ...SAFE_LEAVE_DELETE },
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeHumanProfile(value: unknown): HumanDelayProfile {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'fast' || v === 'off') return v;
  return 'safe';
}

function normalizeStandard(
  raw: Partial<WorkerStandardSettings> | undefined,
  platform: 'whatsapp' | 'telegram',
): WorkerStandardSettings {
  const d =
    platform === 'whatsapp'
      ? defaultWhatsAppWorkerSettings().standard
      : defaultTelegramWorkerSettings().standard;
  const pauseRunsLow = clampInt(raw?.pauseBetweenRunsMinLow, 0, 180, d.pauseBetweenRunsMinLow);
  const pauseScriptsLow = clampInt(
    raw?.pauseBetweenScriptsMinLow,
    0,
    180,
    d.pauseBetweenScriptsMinLow,
  );
  return {
    perRun: clampInt(raw?.perRun, 1, 500, d.perRun),
    betweenGroupsSec: clampInt(raw?.betweenGroupsSec, 5, 3600, d.betweenGroupsSec),
    betweenTargetsSec: clampInt(raw?.betweenTargetsSec, 5, 600, d.betweenTargetsSec),
    afterCreateSec: clampInt(raw?.afterCreateSec, 5, 3600, d.afterCreateSec),
    floodWaitExtraSec: clampInt(raw?.floodWaitExtraSec, 0, 600, d.floodWaitExtraSec),
    maxFloodwaitAutoSleepSec: clampInt(raw?.maxFloodwaitAutoSleepSec, 60, 86400, d.maxFloodwaitAutoSleepSec),
    setPhotoMaxRetry: clampInt(raw?.setPhotoMaxRetry, 0, 5, d.setPhotoMaxRetry),
    humanProfile: normalizeHumanProfile(raw?.humanProfile),
    pauseBetweenRunsMinLow: pauseRunsLow,
    pauseBetweenRunsMinHigh: clampInt(
      raw?.pauseBetweenRunsMinHigh,
      pauseRunsLow,
      180,
      Math.max(pauseRunsLow, d.pauseBetweenRunsMinHigh),
    ),
    pauseBetweenScriptsMinLow: pauseScriptsLow,
    pauseBetweenScriptsMinHigh: clampInt(
      raw?.pauseBetweenScriptsMinHigh,
      pauseScriptsLow,
      180,
      Math.max(pauseScriptsLow, d.pauseBetweenScriptsMinHigh),
    ),
  };
}

function normalizeTelegramAdminRights(
  raw: Partial<TelegramAdminRightsSettings> | undefined,
): TelegramAdminRightsSettings {
  const d = SAFE_TELEGRAM_ADMIN_RIGHTS;
  return {
    changeInfo: clampBool(raw?.changeInfo, d.changeInfo),
    postMessages: clampBool(raw?.postMessages, d.postMessages),
    editMessages: clampBool(raw?.editMessages, d.editMessages),
    deleteMessages: clampBool(raw?.deleteMessages, d.deleteMessages),
    banUsers: clampBool(raw?.banUsers, d.banUsers),
    inviteUsers: clampBool(raw?.inviteUsers, d.inviteUsers),
    pinMessages: clampBool(raw?.pinMessages, d.pinMessages),
    addAdmins: clampBool(raw?.addAdmins, d.addAdmins),
    manageCall: clampBool(raw?.manageCall, d.manageCall),
    anonymous: clampBool(raw?.anonymous, d.anonymous),
    deleteStories: clampBool(raw?.deleteStories, d.deleteStories),
  };
}

function normalizeCreateGroup(
  raw: Partial<WorkerCreateGroupSettings> | undefined,
  platform: 'whatsapp' | 'telegram',
): WorkerCreateGroupSettings {
  const d =
    platform === 'whatsapp'
      ? defaultWhatsAppWorkerSettings().createGroup
      : defaultTelegramWorkerSettings().createGroup;
  return {
    hideChatHistoryForMembers: clampBool(raw?.hideChatHistoryForMembers, d.hideChatHistoryForMembers),
    messagesAdminsOnly: clampBool(raw?.messagesAdminsOnly, d.messagesAdminsOnly),
    addMembersAdminsOnly: clampBool(raw?.addMembersAdminsOnly, d.addMembersAdminsOnly),
    infoAdminsOnly: clampBool(raw?.infoAdminsOnly, d.infoAdminsOnly),
    telegramAdminRights: normalizeTelegramAdminRights(raw?.telegramAdminRights),
  };
}

function normalizeInviteLink(raw: Partial<WorkerInviteLinkSettings> | undefined): WorkerInviteLinkSettings {
  const d = SAFE_INVITE_LINK;
  const delayMinSec = clampInt(raw?.delayMinSec, 5, 600, d.delayMinSec);
  return {
    delayMinSec,
    delayMaxSec: clampInt(raw?.delayMaxSec, delayMinSec, 900, Math.max(delayMinSec, d.delayMaxSec)),
    batchEvery: clampInt(raw?.batchEvery, 1, 100, d.batchEvery),
    batchDelayMinSec: clampInt(raw?.batchDelayMinSec, 30, 3600, d.batchDelayMinSec),
    batchDelayMaxSec: clampInt(
      raw?.batchDelayMaxSec,
      30,
      7200,
      Math.max(d.batchDelayMinSec, d.batchDelayMaxSec),
    ),
    maxPerRun: clampInt(raw?.maxPerRun, 0, 500, d.maxPerRun),
    inviteExportRetries: clampInt(raw?.inviteExportRetries, 0, 20, d.inviteExportRetries),
    inviteExportRetrySec: clampInt(raw?.inviteExportRetrySec, 1, 120, d.inviteExportRetrySec),
  };
}

function normalizeSetAdmin(raw: Partial<WorkerSetAdminSettings> | undefined): WorkerSetAdminSettings {
  const d = SAFE_SET_ADMIN;
  return {
    maxAdminSlots: clampInt(raw?.maxAdminSlots, 1, 5, d.maxAdminSlots),
    betweenTargetsSec: clampInt(raw?.betweenTargetsSec, 5, 600, d.betweenTargetsSec),
    resolveEntityMaxAttempts: clampInt(raw?.resolveEntityMaxAttempts, 1, 10, d.resolveEntityMaxAttempts),
  };
}

function normalizeLeaveDelete(
  raw: Partial<WorkerLeaveDeleteSettings> | undefined,
): WorkerLeaveDeleteSettings {
  const d = SAFE_LEAVE_DELETE;
  return {
    leaveEnabled: clampBool(raw?.leaveEnabled, d.leaveEnabled),
    deleteEnabled: clampBool(raw?.deleteEnabled, d.deleteEnabled),
    requireOwnerForDelete: clampBool(raw?.requireOwnerForDelete, d.requireOwnerForDelete),
    clearChatHistoryOnDelete: clampBool(raw?.clearChatHistoryOnDelete, d.clearChatHistoryOnDelete),
    betweenGroupsSec: clampInt(raw?.betweenGroupsSec, 5, 3600, d.betweenGroupsSec),
  };
}

export function normalizePlatformWorkerSettings(
  raw: Partial<PlatformWorkerSettings> | undefined,
  platform: 'whatsapp' | 'telegram',
): PlatformWorkerSettings {
  const defaults =
    platform === 'whatsapp' ? defaultWhatsAppWorkerSettings() : defaultTelegramWorkerSettings();
  return {
    standard: normalizeStandard({ ...defaults.standard, ...raw?.standard }, platform),
    createGroup: normalizeCreateGroup({ ...defaults.createGroup, ...raw?.createGroup }, platform),
    inviteLink: normalizeInviteLink({ ...defaults.inviteLink, ...raw?.inviteLink }),
    setAdmin: normalizeSetAdmin({ ...defaults.setAdmin, ...raw?.setAdmin }),
    leaveDelete: normalizeLeaveDelete({ ...defaults.leaveDelete, ...raw?.leaveDelete }),
  };
}

function readFromStorage(
  key: string,
  platform: 'whatsapp' | 'telegram',
): PlatformWorkerSettings {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return platform === 'whatsapp' ? defaultWhatsAppWorkerSettings() : defaultTelegramWorkerSettings();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return platform === 'whatsapp' ? defaultWhatsAppWorkerSettings() : defaultTelegramWorkerSettings();
    }
    return normalizePlatformWorkerSettings(parsed as Partial<PlatformWorkerSettings>, platform);
  } catch {
    return platform === 'whatsapp' ? defaultWhatsAppWorkerSettings() : defaultTelegramWorkerSettings();
  }
}

export function readWhatsAppWorkerSettings(): PlatformWorkerSettings {
  return readFromStorage(WHATSAPP_WORKER_SETTINGS_STORAGE_KEY, 'whatsapp');
}

export function readTelegramWorkerSettings(): PlatformWorkerSettings {
  return readFromStorage(TELEGRAM_WORKER_SETTINGS_STORAGE_KEY, 'telegram');
}

export function persistWhatsAppWorkerSettings(settings: PlatformWorkerSettings): void {
  localStorage.setItem(
    WHATSAPP_WORKER_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizePlatformWorkerSettings(settings, 'whatsapp')),
  );
  notifyWorkerPlatformSettingsChanged();
}

export function persistTelegramWorkerSettings(settings: PlatformWorkerSettings): void {
  localStorage.setItem(
    TELEGRAM_WORKER_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizePlatformWorkerSettings(settings, 'telegram')),
  );
  notifyWorkerPlatformSettingsChanged();
}

export function workerSettingsEqual(a: PlatformWorkerSettings, b: PlatformWorkerSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function workerSettingsSummary(settings: PlatformWorkerSettings): string {
  const { humanProfile, perRun } = settings.standard;
  return `${humanProfile} · ${perRun}/run`;
}

export function notifyWorkerPlatformSettingsChanged(): void {
  window.dispatchEvent(new Event('rm-worker-settings-changed'));
}

/** Map TG admin rights → sidecar set_admin payload. */
export function toTelegramAdminRightsPayload(
  settings: PlatformWorkerSettings,
): Record<string, boolean> {
  const r = settings.createGroup.telegramAdminRights;
  return {
    change_info: r.changeInfo,
    post_messages: r.postMessages,
    edit_messages: r.editMessages,
    delete_messages: r.deleteMessages,
    ban_users: r.banUsers,
    invite_users: r.inviteUsers,
    pin_messages: r.pinMessages,
    add_admins: r.addAdmins,
    manage_call: r.manageCall,
    anonymous: r.anonymous,
    delete_stories: r.deleteStories,
  };
}

function jitterPercentFromHumanProfile(profile: HumanDelayProfile): number {
  if (profile === 'off') return 0;
  if (profile === 'fast') return 15;
  return 35;
}

export type AutomationDelayAction =
  | 'create_group'
  | 'set_admin'
  | 'join_by_invite_link'
  | 'leave_group'
  | 'delete_group'
  | 'exit_delete_group';

/** Map Settings worker delay → automation IPC payload (frozen at enqueue). */
export function toAutomationDelayConfig(
  settings: PlatformWorkerSettings,
  action?: AutomationDelayAction,
): AutomationJobDelayConfig {
  const betweenTargetsSec =
    action === 'set_admin'
      ? settings.setAdmin.betweenTargetsSec
      : settings.standard.betweenTargetsSec;

  const betweenGroupsSec =
    action === 'leave_group' || action === 'delete_group' || action === 'exit_delete_group'
      ? settings.leaveDelete.betweenGroupsSec
      : settings.standard.betweenGroupsSec;

  return {
    between_groups_sec: betweenGroupsSec,
    between_targets_sec: betweenTargetsSec,
    after_create_sec: settings.standard.afterCreateSec,
    flood_wait_extra_sec: settings.standard.floodWaitExtraSec,
    max_floodwait_auto_sleep_sec: settings.standard.maxFloodwaitAutoSleepSec,
    invite_export_retries: settings.inviteLink.inviteExportRetries,
    invite_export_retry_sec: settings.inviteLink.inviteExportRetrySec,
    jitter_percent: jitterPercentFromHumanProfile(settings.standard.humanProfile),
    pause_between_runs_min_sec: settings.standard.pauseBetweenRunsMinLow * 60,
    pause_between_runs_max_sec: settings.standard.pauseBetweenRunsMinHigh * 60,
    invite_delay_min_sec: settings.inviteLink.delayMinSec,
    invite_delay_max_sec: settings.inviteLink.delayMaxSec,
    invite_batch_every: settings.inviteLink.batchEvery,
    invite_batch_delay_min_sec: settings.inviteLink.batchDelayMinSec,
    invite_batch_delay_max_sec: settings.inviteLink.batchDelayMaxSec,
    resolve_entity_max_attempts: settings.setAdmin.resolveEntityMaxAttempts,
    max_admin_slots: settings.setAdmin.maxAdminSlots,
  };
}

export function toLeaveDeleteJobPayload(
  settings: PlatformWorkerSettings,
): { clearChatHistoryOnDelete: boolean; requireOwnerForDelete: boolean } {
  return {
    clearChatHistoryOnDelete: settings.leaveDelete.clearChatHistoryOnDelete,
    requireOwnerForDelete: settings.leaveDelete.requireOwnerForDelete,
  };
}

/** Exit & delete membutuhkan leave + delete enabled di Settings. */
export function isExitDeleteEnabled(settings: PlatformWorkerSettings): boolean {
  return settings.leaveDelete.leaveEnabled && settings.leaveDelete.deleteEnabled;
}

/** Export shape compatible with learning telegram config.json (subset). */
export function toTelegramLearningConfigShape(settings: PlatformWorkerSettings): Record<string, unknown> {
  const r = settings.createGroup.telegramAdminRights;
  return {
    group: {
      hide_chat_history_for_members: settings.createGroup.hideChatHistoryForMembers,
    },
    admin: {
      rights: {
        change_info: r.changeInfo,
        post_messages: r.postMessages,
        edit_messages: r.editMessages,
        delete_messages: r.deleteMessages,
        ban_users: r.banUsers,
        invite_users: r.inviteUsers,
        pin_messages: r.pinMessages,
        add_admins: r.addAdmins,
        manage_call: r.manageCall,
        anonymous: r.anonymous,
        delete_stories: r.deleteStories,
      },
    },
    delay: {
      between_groups_sec: settings.standard.betweenGroupsSec,
      between_targets_sec: settings.standard.betweenTargetsSec,
      after_create_sec: settings.standard.afterCreateSec,
      flood_wait_extra_sec: settings.standard.floodWaitExtraSec,
      max_floodwait_auto_sleep_sec: settings.standard.maxFloodwaitAutoSleepSec,
      set_photo_max_retry: settings.standard.setPhotoMaxRetry,
      invite_export_retries: settings.inviteLink.inviteExportRetries,
      invite_export_retry_sec: settings.inviteLink.inviteExportRetrySec,
      resolve_entity_max_attempts: settings.setAdmin.resolveEntityMaxAttempts,
      human: {
        profile: settings.standard.humanProfile,
        pause_between_runs_minutes: [
          settings.standard.pauseBetweenRunsMinLow,
          settings.standard.pauseBetweenRunsMinHigh,
        ],
        pause_between_scripts_minutes: [
          settings.standard.pauseBetweenScriptsMinLow,
          settings.standard.pauseBetweenScriptsMinHigh,
        ],
      },
    },
    delete: {
      require_owner: settings.leaveDelete.requireOwnerForDelete,
    },
  };
}

/** Export shape for future WA worker (wwebjs GroupChat settings). */
export function toWhatsAppWorkerConfigShape(settings: PlatformWorkerSettings): Record<string, unknown> {
  return {
    createGroup: {
      messagesAdminsOnly: settings.createGroup.messagesAdminsOnly,
      addMembersAdminsOnly: settings.createGroup.addMembersAdminsOnly,
      infoAdminsOnly: settings.createGroup.infoAdminsOnly,
    },
    inviteLink: settings.inviteLink,
    setAdmin: settings.setAdmin,
    leaveDelete: settings.leaveDelete,
    delay: settings.standard,
  };
}
