export type AutomationJobAction =
  | 'create_group'
  | 'set_group_photo'
  | 'set_admin'
  | 'join_by_invite_link'
  | 'leave_group'
  | 'delete_group'
  | 'exit_delete_group';

export interface AutomationJobGroupItem {
  groupId: string;
  groupName?: string;
  inviteLink?: string;
  groupLink?: string;
}

export type AutomationJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type AutomationJobRunnerState = 'idle' | 'running' | 'paused';

export type Platform = 'whatsapp' | 'telegram';

export interface AutomationJobPayload {
  groupName?: string;
  groupId?: string;
  groupLink?: string;
  inviteLink?: string;
  groups?: AutomationJobGroupItem[];
  targets?: string[];
  description?: string;
  hideChatHistory?: boolean;
  initialParticipants?: string[];
  adminRights?: Record<string, boolean>;
  /** Batch create: total groups in one queue row */
  totalToCreate?: number;
  perRun?: number;
  startFrom?: number;
  useGroupNumbering?: boolean;
  groupNamePrefix?: string;
  batchIndex?: number;
  batchTotal?: number;
  joinSequenceIndex?: number;
  targetAccountNames?: string[];
  createGroupSettings?: {
    messagesAdminsOnly?: boolean;
    addMembersAdminsOnly?: boolean;
    infoAdminsOnly?: boolean;
  };
  leaveDelete?: {
    clearChatHistoryOnDelete?: boolean;
    requireOwnerForDelete?: boolean;
  };
  exitDeletePhase?: 'exit' | 'delete';
  sourceExitJobId?: string;
  sourceCreateJobId?: string;
  setPhotoPhase?: 'apply';
  photoPath?: string;
  groupOutcomes?: Array<{
    groupId: string;
    groupName?: string;
    inviteLink?: string;
    groupLink?: string;
    createStatus?: 'created' | 'failed';
    photoStatus?: 'set' | 'failed';
    exitStatus?: 'left' | 'failed' | 'pending';
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
  /** Antrian menunggu; tidak di-dispatch selama true. */
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
  blockingExecutes: boolean;
  busyAccountIds: string[];
  /** sessionId device — jeda post-job automation (5s). */
  settlingSessionIds: string[];
  /** Scrape aktif di PC (informasi; tidak blok global). */
  globalScrapeActive: boolean;
  /** Device sessionId dengan scrape user atau auto lane aktif. */
  activeScrapeSessionIds: string[];
  executeSlotsActive: number;
  executeSlotsMax: number;
  executeSlotsQueued: number;
}

export interface AutomationJobListFilter {
  brandName?: string;
  platform?: Platform;
}

interface PersistedQueueState {
  jobs: AutomationJobRecord[];
  runnerPaused: boolean;
}

export type { PersistedQueueState };
