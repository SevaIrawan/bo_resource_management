export type AutomationAction =
  | 'create_group'
  | 'set_group_photo'
  | 'set_admin'
  | 'join_by_invite_link'
  | 'leave_group'
  | 'delete_group'
  | 'exit_delete_group';

export type AutomationProgressCallback = (current: number, total: number, label: string) => void;

export type Platform = 'whatsapp' | 'telegram';

export interface AutomationDelayConfig {
  between_groups_sec?: number;
  between_targets_sec?: number;
  after_create_sec?: number;
  flood_wait_extra_sec?: number;
  max_floodwait_auto_sleep_sec?: number;
  invite_export_retries?: number;
  invite_export_retry_sec?: number;
  jitter_percent?: number;
  /** Learning run_create_until_done — jeda antar batch (detik). */
  pause_between_runs_min_sec?: number;
  pause_between_runs_max_sec?: number;
  invite_delay_min_sec?: number;
  invite_delay_max_sec?: number;
  invite_batch_every?: number;
  invite_batch_delay_min_sec?: number;
  invite_batch_delay_max_sec?: number;
  resolve_entity_max_attempts?: number;
  max_admin_slots?: number;
  /** TG set_group_photo — retry unggah foto. */
  set_photo_max_retry?: number;
}

export interface WaCreateGroupSettings {
  messagesAdminsOnly?: boolean;
  addMembersAdminsOnly?: boolean;
  infoAdminsOnly?: boolean;
}

export interface AutomationRunPayload {
  sessionId: string;
  platform: Platform;
  action: AutomationAction;
  storedSessionString?: string | null;
  expectedPhone?: string;
  delay?: AutomationDelayConfig;
  /** create_group */
  groupName?: string;
  description?: string;
  hideChatHistory?: boolean;
  initialParticipants?: string[];
  /** 1-based index in batch (for between_groups delay before 2+) */
  batchIndex?: number;
  totalToCreate?: number;
  /** Learning group.per_run — max grup per slice dalam satu job. */
  perRun?: number;
  startFrom?: number;
  useGroupNumbering?: boolean;
  groupNamePrefix?: string;
  createGroupSettings?: WaCreateGroupSettings;
  /** set_admin */
  groupId?: string;
  groupLink?: string;
  targets?: string[];
  adminRights?: Record<string, boolean>;
  /** join_by_invite_link */
  inviteLink?: string;
  joinSequenceIndex?: number;
  groups?: Array<{
    groupId: string;
    groupName?: string;
    inviteLink?: string;
    groupLink?: string;
  }>;
  /** set_group_photo — path absolut foto brand */
  photoPath?: string;
  /** exit_delete_group — frozen from Admin leaveDelete settings */
  leaveDelete?: {
    clearChatHistoryOnDelete?: boolean;
    requireOwnerForDelete?: boolean;
  };
  /** Job queue runner — cooperative cancel/pause mid-automation. */
  jobId?: string;
}

export interface AutomationRunResult {
  status: 'ok' | 'error';
  action: AutomationAction;
  message?: string;
  errorCode?: string;
  result?: Record<string, unknown>;
}

export const DEFAULT_AUTOMATION_DELAY: AutomationDelayConfig = {
  between_targets_sec: 3,
  after_create_sec: 2,
  flood_wait_extra_sec: 5,
  max_floodwait_auto_sleep_sec: 7200,
  invite_export_retries: 3,
  invite_export_retry_sec: 3,
  jitter_percent: 35,
};
