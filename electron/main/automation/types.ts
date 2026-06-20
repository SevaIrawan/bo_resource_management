export type AutomationAction = 'create_group' | 'set_admin' | 'join_by_invite_link';

export type Platform = 'whatsapp' | 'telegram';

export interface AutomationDelayConfig {
  between_targets_sec?: number;
  after_create_sec?: number;
  flood_wait_extra_sec?: number;
  max_floodwait_auto_sleep_sec?: number;
  invite_export_retries?: number;
  invite_export_retry_sec?: number;
  jitter_percent?: number;
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
  /** set_admin */
  groupId?: string;
  groupLink?: string;
  targets?: string[];
  adminRights?: Record<string, boolean>;
  /** join_by_invite_link */
  inviteLink?: string;
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
