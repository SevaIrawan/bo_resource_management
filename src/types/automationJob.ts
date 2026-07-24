import type { Platform } from '@/types/database';

export type AutomationJobAction =
  | 'create_group'
  | 'set_group_photo'
  | 'set_admin'
  | 'join_by_invite_link'
  | 'leave_group'
  | 'delete_group'
  | 'exit_delete_group';

/** Satu entri grup dalam job per-akun (join / set admin). */
export interface AutomationJobGroupItem {
  groupId: string;
  groupName?: string;
  inviteLink?: string;
  groupLink?: string;
}

export type AutomationJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type AutomationJobRunnerState = 'idle' | 'running' | 'paused';

export interface AutomationJobPayload {
  groupName?: string;
  groupId?: string;
  groupLink?: string;
  inviteLink?: string;
  /** Semua grup untuk job per-akun (join / set admin). */
  groups?: AutomationJobGroupItem[];
  targets?: string[];
  description?: string;
  hideChatHistory?: boolean;
  initialParticipants?: string[];
  adminRights?: Record<string, boolean>;
  /** Batch create: total groups in one queue row */
  totalToCreate?: number;
  /** Learning per_run — max groups per slice inside one job */
  perRun?: number;
  startFrom?: number;
  /** Batch create: append " {n}" to group name when true. */
  useGroupNumbering?: boolean;
  groupNamePrefix?: string;
  batchIndex?: number;
  batchTotal?: number;
  /** Join batch: 1-based index for invite-link throttle (Settings → Invite by link). */
  joinSequenceIndex?: number;
  /** Set admin — nama akun target (selaras kolom TARGET ADMIN di modal VIEW). */
  targetAccountNames?: string[];
  createGroupSettings?: {
    messagesAdminsOnly?: boolean;
    addMembersAdminsOnly?: boolean;
    infoAdminsOnly?: boolean;
  };
  leaveDelete?: {
    clearChatHistoryOnDelete?: boolean;
    requireOwnerForDelete?: boolean;
    /** false = jangan auto-enqueue delete setelah left (Settings). */
    deleteEnabled?: boolean;
  };
  /** Exit & delete module — fase exit (leave) dari SETUP; delete dari VIEW result. */
  exitDeletePhase?: 'exit' | 'delete';
  /** delete_group — job exit (leave_group) sumber grup yang sudah left. */
  sourceExitJobId?: string;
  /** set_group_photo — job create_group sumber grup yang sudah created. */
  sourceCreateJobId?: string;
  setPhotoPhase?: 'apply';
  /** Path absolut file foto brand (satu foto untuk semua grup). */
  photoPath?: string;
  /** User ID untuk resolve foto dari Supabase Storage di PC lain. */
  userId?: string;
  /** Hasil per grup setelah create / join / set photo / exit / delete. */
  groupOutcomes?: Array<{
    groupId: string;
    groupName?: string;
    inviteLink?: string;
    groupLink?: string;
    createStatus?: 'created' | 'failed';
    joinStatus?: 'joined' | 'already_member' | 'failed';
    joinError?: string;
    adminStatus?: 'promoted' | 'failed';
    adminError?: string;
    photoStatus?: 'set' | 'failed';
    exitStatus?: 'left' | 'failed' | 'pending';
    exitError?: string;
    deleteStatus?: 'deleted' | 'failed' | 'pending' | 'skipped';
  }>;
}

export interface AutomationJobProgress {
  current: number;
  total: number;
  label?: string;
}

export interface AutomationJobDelayConfig {
  between_groups_sec?: number;
  between_targets_sec?: number;
  after_create_sec?: number;
  flood_wait_extra_sec?: number;
  max_floodwait_auto_sleep_sec?: number;
  invite_export_retries?: number;
  invite_export_retry_sec?: number;
  jitter_percent?: number;
  pause_between_runs_min_sec?: number;
  pause_between_runs_max_sec?: number;
  /** Invite/join throttle (Settings → Invite by link). */
  invite_delay_min_sec?: number;
  invite_delay_max_sec?: number;
  invite_batch_every?: number;
  invite_batch_delay_min_sec?: number;
  invite_batch_delay_max_sec?: number;
  /** Set admin (Settings → Set admin). */
  resolve_entity_max_attempts?: number;
  max_admin_slots?: number;
  /** TG set_group_photo — retry unggah foto. */
  set_photo_max_retry?: number;
}

export interface AutomationJobRecord {
  id: string;
  brandName: string;
  platform: Platform;
  accountId: string;
  accountName: string;
  sessionId: string;
  action: AutomationJobAction;
  status: AutomationJobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  message?: string;
  progress?: AutomationJobProgress;
  payload: AutomationJobPayload;
  storedSessionString?: string | null;
  expectedPhone?: string;
  delay?: AutomationJobDelayConfig;
  /** Waiting in queue; runner skips while true. */
  paused?: boolean;
}

export interface AutomationJobEnqueueInput {
  brandName: string;
  platform: Platform;
  accountId: string;
  accountName: string;
  sessionId: string;
  action: AutomationJobAction;
  payload: AutomationJobPayload;
  storedSessionString?: string | null;
  expectedPhone?: string;
  delay?: AutomationJobDelayConfig;
  /** Allow multiple queued jobs per account+action (batch split). */
  allowMultipleQueued?: boolean;
}

export interface AutomationJobQueueSnapshot {
  jobs: AutomationJobRecord[];
  runnerState: AutomationJobRunnerState;
  /** @deprecated use runningJobIds */
  runningJobId: string | null;
  runningJobIds: string[];
  maxConcurrent: number;
  runningCount: number;
  queuedCount: number;
  /** @deprecated global block dihapus — gunakan busyAccountIds per akun. */
  blockingExecutes: boolean;
  busyAccountIds: string[];
  settlingSessionIds: string[];
  globalScrapeActive: boolean;
  activeScrapeSessionIds: string[];
  executeSlotsActive: number;
  executeSlotsMax: number;
  executeSlotsQueued: number;
}

export interface AutomationJobListFilter {
  brandName?: string;
  platform?: Platform;
}
