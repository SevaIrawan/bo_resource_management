// Resource Management — TypeScript types (reference)

export interface UserRecord {
  id: string;
  username: string;
  password: string;
  role: string;
  created_at?: string;
  updated_at?: string;
  allowed_brands?: string | null;
}

export type Platform = 'whatsapp' | 'telegram';
export type LoginMethod = 'qr' | 'phone';
export type AdminYesNo = 'yes' | 'no';

export interface Brand {
  id: string;
  user_id: string;
  name: string;
  standard_group_count: number;
  empty_slot_count: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MessagingAccount {
  id: string;
  user_id: string;
  brand_id: string;
  platform: Platform;
  label: string;
  phone_number: string | null;
  location_device: string | null;
  is_active: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PlatformSession {
  id: string;
  account_id: string;
  session_data: string;
  session_type: 'whatsapp_local_auth' | 'telethon_string' | 'telethon_sqlite';
  login_method: LoginMethod | null;
  is_active: boolean;
  connected_at: string | null;
  disconnected_at: string | null;
  disconnect_reason: string | null;
  last_sync_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type PlatformSessionEventType =
  | 'connect'
  | 'disconnect'
  | 'login_qr'
  | 'login_phone'
  | 'login_success'
  | 'login_failed'
  | 'session_restored'
  | 'session_expired'
  | 'probe_failed'
  | 'device_logout'
  | 'db_invalidated'
  | 'sync_valid'
  | 'session_replaced';

export type SessionActivityStatus = 'valid' | 'logout' | 'invalid' | 'replaced';

export interface PlatformSessionLog {
  id: string;
  account_id: string;
  platform_session_id: string | null;
  platform: Platform;
  session_status: SessionActivityStatus | null;
  event_type: PlatformSessionEventType;
  login_method: LoginMethod | null;
  message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type ScrapeRunStatus = 'started' | 'running' | 'completed' | 'failed' | 'partial';

export interface ScrapeRun {
  id: string;
  account_id: string;
  platform: Platform;
  trigger_type: 'scheduled' | 'manual';
  status: ScrapeRunStatus;
  groups_total: number;
  groups_success: number;
  groups_failed: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
}

export interface GroupScrapeRow {
  id: string;
  account_id: string;
  group_name: string | null;
  group_id: string;
  invite_link: string | null;
  owner_count: number;
  admin_count: number;
  member_count: number;
  is_admin: AdminYesNo;
  /** Creator/owner akun scrape ini — daily only; master tidak punya kolom ini. */
  is_owner: AdminYesNo;
  platform: Platform;
  scrape_date: string;
  scraped_at: string;
  created_at: string;
  brand: string;
  acc_name: string;
  phone_number: string;
}

export type GroupScrapeDaily = GroupScrapeRow;

/** Master brand — rekap per brand+platform (bukan per account). */
export interface GroupsMaster {
  id: string;
  group_id: string;
  group_name: string;
  invite_link: string;
  brand: string;
  platform: Platform;
  last_sync: string;
  owner_count: number;
  admin_count: number;
  member_count: number;
  member_non_admin: number;
}

export interface AccountSnapshot {
  account_id: string;
  brand_id: string;
  platform: Platform;
  status: 'active' | 'logout';
  session_status: 'valid' | 'invalid';
  sync_state: 'pending' | 'synced';
  groups_current: number;
  groups_total: number;
  admin_current: number;
  admin_total: number;
  is_misaligned: boolean;
  last_sync_at: string | null;
  updated_at: string;
}

export interface BrandStandardGroup {
  id: string;
  brand_id: string;
  group_name: string;
  group_id: string | null;
  invite_link: string | null;
  sort_order: number;
  created_at: string;
}
