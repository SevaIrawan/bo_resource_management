// Resource Management — TypeScript types (reference)
// Generate types from Supabase CLI later: supabase gen types typescript

/** Tabel public.users — existing Supabase (login: username + password) */
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
export type GroupStatus = 'active' | 'left' | 'banned' | 'broken' | 'empty' | 'error';

export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  platform: 'desktop' | 'web';
  device_info: Record<string, unknown>;
  ip_address: string | null;
  is_active: boolean;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  end_reason: 'logout' | 'expired' | 'revoked' | 'replaced' | 'forced' | null;
  created_at: string;
}

export interface SessionLog {
  id: string;
  user_id: string | null;
  session_id: string | null;
  event_type: 'login' | 'logout' | 'refresh' | 'expired' | 'failed' | 'revoked';
  platform: string;
  device_info: Record<string, unknown>;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MessagingAccount {
  id: string;
  user_id: string;
  platform: Platform;
  label: string;
  phone_or_username: string | null;
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

export interface PlatformSessionLog {
  id: string;
  account_id: string;
  platform_session_id: string | null;
  platform: Platform;
  event_type: string;
  login_method: LoginMethod | null;
  message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GroupScrapeDaily {
  id: string;
  scrape_log_id: string | null;
  account_id: string;
  platform: Platform;
  brand: string;
  acc_name: string;
  /** Phone/username akun WA/TG — bukan participant group. NULL jika user belum isi saat Add Account. */
  phone_or_username: string | null;
  scrape_date: string;
  group_name: string | null;
  group_id: string;
  group_link: string | null;
  is_admin: boolean;
  count_owner: number;
  count_admin: number;
  count_member: number;
  count_participant: number;
  group_status: GroupStatus;
  error_message: string | null;
  is_archived: boolean;
  is_readonly: boolean;
  scraped_at: string;
  created_at: string;
}

export interface GroupsMaster {
  id: string;
  account_id: string;
  platform: Platform;
  brand: string;
  acc_name: string;
  /** Phone/username akun WA/TG — bukan participant group. NULL jika user belum isi saat Add Account. */
  phone_or_username: string | null;
  group_name: string;
  group_id: string;
  group_link: string | null;
  is_admin: boolean;
  count_owner: number;
  count_admin: number;
  count_member: number;
  count_participant: number;
  is_archived: boolean;
  is_readonly: boolean;
  first_seen_at: string;
  last_verified_at: string;
  last_daily_id: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ScrapeLog {
  id: string;
  account_id: string;
  platform: Platform;
  trigger_type: 'scheduled' | 'manual';
  status: 'started' | 'running' | 'completed' | 'failed' | 'partial';
  groups_total: number;
  groups_success: number;
  groups_failed: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
}
